#!/usr/bin/env node

/**
 * `npm run dev` preflight: decide which API data the dev server serves, then
 * start Vite with that decision in AMMITTO_DEV_DATA.
 *
 * It launches Vite itself rather than running before it as a separate npm
 * step, because an environment variable set in one npm step does not reach
 * the next.
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import ts from 'typescript';
import {
  DEV_DATA_ENV, decideDevData, parsePromptAnswer, requiredApiFiles,
} from './dev-data-mode.js';
import { LIVE_ORIGIN_ENV, SITE_ORIGIN as LIVE_ORIGIN, resolveLiveOrigin } from './dev-api-proxy.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'public/api/v1');

// The fetch list comes from the module the app itself uses, so this check
// cannot drift from what the browse page requests. Node 20 cannot import
// TypeScript, so the module is type-erased in memory with the typescript
// devDependency, the same erasure tsconfig.test.json relies on; it has no
// imports, which is what makes a data: URL import possible.
async function fetchableSources() {
  const file = path.join(ROOT, 'src/utils/sourceCatalog.ts');
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
  return mod.fetchableSources();
}

function warning(missing) {
  const shown = missing.slice(0, 5).map((f) => `  - api/v1/${f}`);
  if (missing.length > shown.length) shown.push(`  ... and ${missing.length - shown.length} more`);
  return [
    '',
    `WARNING: public/api/v1 is incomplete: ${missing.length} file(s) the site loads`,
    'are missing or empty. It holds the small committed sample or a',
    'stale data-cn copy, and pages that need a missing file will not load.',
    ...shown,
    '',
  ].join('\n');
}

const PROMPT =
  `  [L]ive: fetch missing /api/v1 files from ${LIVE_ORIGIN} (default)\n` +
  '  [S]ample: serve public/api/v1 only; missing files 404\n' +
  '  [Q]uit\n' +
  'Choice [L/s/q]: ';

// Line iteration rather than rl.question(): question() drops lines that
// arrive before it is called, so a fast second answer after a bad first one
// was lost. End of input (Ctrl-D) counts as quit.
async function ask() {
  const rl = createInterface({ input: process.stdin });
  process.stdout.write(PROMPT);
  try {
    for await (const answer of rl) {
      const choice = parsePromptAnswer(answer);
      if (choice) return choice;
      process.stdout.write(`Not understood: "${answer}".\n${PROMPT}`);
    }
    return 'quit';
  } finally {
    rl.close();
  }
}

async function main() {
  // An empty or non-file entry is as useless to a page as a missing one.
  const usable = (f) => {
    try {
      const st = fs.statSync(path.join(API_DIR, f));
      return st.isFile() && st.size > 0;
    } catch {
      return false;
    }
  };
  const missing = requiredApiFiles(await fetchableSources()).filter((f) => !usable(f));
  const decision = decideDevData({
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    envValue: process.env[DEV_DATA_ENV],
    missing,
  });

  let mode;
  if (decision.action === 'error') {
    console.error(`ERROR: ${decision.message}`);
    process.exit(1);
  } else if (decision.action === 'prompt') {
    console.log(warning(missing));
    const choice = await ask();
    if (choice === 'quit') process.exit(0);
    mode = choice;
  } else {
    if (decision.warn) {
      console.log(warning(missing));
      console.log(`Serving public/api/v1 only. Set ${DEV_DATA_ENV}=live to fetch missing files from ${LIVE_ORIGIN}.\n`);
    }
    mode = decision.mode;
  }

  if (mode === 'live') {
    try {
      resolveLiveOrigin(process.env[LIVE_ORIGIN_ENV]);
    } catch (err) {
      console.error(`ERROR: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`API data mode: ${mode}`);

  // vite's exports map hides bin/, but package.json is exported.
  const vitePkg = createRequire(import.meta.url).resolve('vite/package.json');
  const viteBin = path.join(path.dirname(vitePkg), 'bin/vite.js');
  const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, [DEV_DATA_ENV]: mode },
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

main();
