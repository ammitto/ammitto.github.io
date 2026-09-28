/**
 * The dev server's handler for /api/v1/, kept out of vite.config.ts so the
 * unit tests can drive it with real sockets and no Vite.
 *
 * A file that exists in public/api/v1 is left to Vite's public-dir serving,
 * so a local file always wins. A missing one is fetched from the published
 * site in live mode, and is a plain 404 in sample mode; without this, Vite's
 * SPA fallback answers it with index.html, which the app then fails to parse
 * as JSON far from the cause. The check is per request rather than proxying
 * all of /api/v1/ in live mode, precisely so local overrides keep working.
 */

import fs from 'fs';
import path from 'path';
import https from 'https';

export const SITE_ORIGIN = 'https://www.ammitto.org';
export const LIVE_ORIGIN_ENV = 'AMMITTO_DEV_LIVE_ORIGIN';

/**
 * How long the upstream may stay silent before the request is abandoned with
 * a 504. It is an idle limit, not a total one, so a large aggregate that keeps
 * streaming is never cut off; 15 seconds is far beyond a healthy first byte
 * from the CDN and short enough that a dead network surfaces as an error
 * instead of a page that spins.
 */
export const UPSTREAM_IDLE_MS = 15_000;

/** Hop-by-hop headers (RFC 9110 section 7.6.1), plus cookies from the live site. */
const DROPPED_HEADERS = new Set([
  'connection', 'keep-alive', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'set-cookie',
]);

/**
 * The origin live mode fetches from. Overridable only so the failure paths
 * can be exercised against an address that never answers; the proxy speaks
 * https alone, so anything else is refused here, at startup, rather than as
 * a 500 on the first request.
 *
 * @param {string|undefined} value  the AMMITTO_DEV_LIVE_ORIGIN value
 * @returns {string}
 */
export function resolveLiveOrigin(value) {
  if (value === undefined || value === '') return SITE_ORIGIN;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${LIVE_ORIGIN_ENV} is not a URL: "${value}".`);
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${LIVE_ORIGIN_ENV} must be a bare https origin such as ${SITE_ORIGIN}; got "${value}".`);
  }
  return url.origin;
}

/**
 * Upstream response headers minus those describing the upstream connection,
 * including any it names in its own Connection header, and minus Set-Cookie:
 * the live site's cookies have no business on localhost.
 *
 * @param {Record<string, string|string[]|undefined>} headers  lower-cased, as Node gives them
 */
export function forwardableHeaders(headers) {
  const named = String(headers.connection ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (DROPPED_HEADERS.has(name) || name.startsWith('proxy-') || named.includes(name)) continue;
    out[name] = value;
  }
  return out;
}

/**
 * Connect-style middleware, mounted at /api/v1 (so req.url is the rest).
 *
 * @param {object} options
 * @param {string} options.apiRoot      absolute path of public/api/v1
 * @param {boolean} options.live
 * @param {string} [options.origin]     already validated by resolveLiveOrigin
 * @param {number} [options.idleMs]
 * @param {typeof https.request} [options.request]  injectable for the tests
 */
export function createApiHandler({
  apiRoot, live, origin = SITE_ORIGIN, idleMs = UPSTREAM_IDLE_MS, request = https.request,
}) {
  return (req, res, next) => {
    let rest;
    try {
      rest = decodeURIComponent((req.url ?? '/').split('?')[0]);
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    const local = path.resolve(apiRoot, `.${rest}`);
    const inside = local === apiRoot || local.startsWith(apiRoot + path.sep);
    if (inside && fs.existsSync(local) && fs.statSync(local).isFile()) return next();

    if (!live || !inside) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`Not in public/api/v1: ${rest}\n`);
      return;
    }

    // The body passes through untouched, compressed or not, so the browser
    // decodes it using the upstream Content-Encoding.
    const upstream = request(
      `${origin}${req.originalUrl ?? `/api/v1${req.url}`}`,
      {
        method: req.method,
        headers: {
          accept: req.headers.accept ?? '*/*',
          'accept-encoding': req.headers['accept-encoding'] ?? 'identity',
        },
        timeout: idleMs,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, forwardableHeaders(up.headers));
        up.on('error', () => res.destroy());
        up.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('timed out')));
    upstream.on('error', (err) => {
      // Once the status line is out, a 502 can no longer be sent; cutting the
      // connection is the only way to tell the browser the body is truncated
      // rather than let it parse half a file.
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.statusCode = err.message === 'timed out' ? 504 : 502;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(`Fetching ${origin} failed: ${err.message}\n`);
    });
    // A reload or a navigation abandons the request; stop the download
    // instead of finishing it for nobody.
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    upstream.end();
  };
}
