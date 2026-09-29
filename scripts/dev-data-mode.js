/**
 * Which API data `npm run dev` serves, decided without touching the terminal,
 * the file system or the network so the unit tests can cover every branch.
 *
 * The committed public/api/v1 is a small sample kept on purpose for CI, and a
 * data-cn checkout (which build:api copies over it) is a stale copy covering
 * CN only. Either way pages that need a file the tree lacks simply fail, so
 * the question asked is not where the data came from but whether the tree
 * holds what the pages fetch. An incomplete tree is surfaced: a terminal gets
 * a prompt, anything else gets a warning and the env var's choice.
 *
 * Modes, as passed to Vite in AMMITTO_DEV_DATA:
 *   live   - files missing from public/api/v1 are fetched from the published
 *            site; files that exist locally still win.
 *   sample - only public/api/v1 is served; a missing file is a 404.
 */

export const DEV_DATA_ENV = 'AMMITTO_DEV_DATA'
export const MODES = ['live', 'sample']

/**
 * Every fixed api/v1 path the app requests or links to. A page that needs one
 * that is missing fails, so all of them count toward "complete".
 *
 * Not hand-trusted: tests/devDataMode.test.js scans src/ for every api/v1
 * path literal and fails when one is neither listed here nor exempted in
 * TEMPLATED_PATHS, and when an entry here no longer appears in src/.
 */
export const REQUIRED_STATIC = [
  'all.jsonld',
  'all.ttl',
  'facets/authorities.json',
  'facets/list_types.json',
  'facets/regimes.json',
  'facets/statuses.json',
  'facets/types.json',
  'index.jsonld',
  'node/document-type/index.jsonld',
  'node/group/index.jsonld',
  'node/legal-instrument/index.jsonld',
  'node/organization/index.jsonld',
  'ontology/classes.jsonld',
  'ontology/hierarchy.json',
  'ontology/properties.jsonld',
  'search-index/manifest.json',
  'stats.json',
]

/**
 * Path patterns (a `*` per interpolation) found in src/, and how each is
 * accounted for. Only sources/*.jsonld is expanded into required files; the
 * rest address one record each, and a tree holding the indexes that list
 * those records is judged by the indexes.
 */
export const TEMPLATED_PATHS = {
  'sources/*.jsonld': 'required: expanded per fetchable source by requiredApiFiles',
  'by-document-type/*.jsonld': 'per-record summary slice',
  'by-organization/*.jsonld': 'per-record summary slice',
  'node/*': 'per-record node path; .jsonld is appended at the call site',
  'node/*/*.jsonld': 'per-record node document, any kind',
  'node/document-type/*.jsonld': 'per-record node document',
  'node/entity/*.jsonld': 'per-record node document',
  'node/group/*.jsonld': 'per-record node document',
  'node/legal-instrument/*.jsonld': 'per-record node document',
  'node/organization/*.jsonld': 'per-record node document',
  'ontology/examples/*.jsonld': 'per-class example, loaded on demand',
  'context.jsonld': 'named only in the ApiDocsPage and SchemaPage examples; nothing fetches it',
  '': 'the bare api/v1/ prefix, used to recognise API links',
  'node/': 'prefix that an IRI is rewritten onto; .jsonld is appended later',
  'search-index/': 'prefix the manifest-named shard files are fetched under; the manifest is required, so a tree without shards is judged by it',
}

/**
 * Files, relative to api/v1, a complete tree holds.
 *
 * @param {readonly string[]} fetchableSources  sources with a published
 *   aggregate, from sourceCatalog.ts, so this cannot demand one the site
 *   itself knows is not served
 * @returns {string[]}
 */
export function requiredApiFiles(fetchableSources) {
  return [...REQUIRED_STATIC, ...fetchableSources.map((s) => `sources/${s}.jsonld`)]
}

/**
 * @param {object} input
 * @param {boolean} input.isTTY        stdin and stdout are both a terminal
 * @param {string|undefined} input.envValue  the AMMITTO_DEV_DATA value
 * @param {readonly string[]} input.missing  requiredApiFiles() absent locally
 * @returns {{ action: 'run', mode: 'live'|'sample', warn: boolean }
 *   | { action: 'prompt' }
 *   | { action: 'error', message: string }}
 */
export function decideDevData({ isTTY, envValue, missing }) {
  const incomplete = missing.length > 0

  // An explicit choice always wins, so a script can pin either mode and a
  // complete tree can still ask for live fallback.
  if (envValue !== undefined && envValue !== '') {
    const mode = envValue.trim().toLowerCase()
    if (!MODES.includes(mode)) {
      return {
        action: 'error',
        message: `${DEV_DATA_ENV} must be one of ${MODES.join(', ')}; got "${envValue}".`,
      }
    }
    return { action: 'run', mode, warn: mode === 'sample' && incomplete }
  }

  if (!incomplete) return { action: 'run', mode: 'sample', warn: false }

  if (isTTY) return { action: 'prompt' }

  // Sample, not live: an unattended run must neither hang on a prompt nor
  // reach the network unless it was asked to.
  return { action: 'run', mode: 'sample', warn: true }
}

/**
 * Map a prompt answer to a mode. An empty answer takes the default, live,
 * because someone at a terminal almost always wants the site to work.
 *
 * @param {string} answer
 * @returns {'live'|'sample'|'quit'|null} null when the answer is not understood
 */
export function parsePromptAnswer(answer) {
  const a = answer.trim().toLowerCase()
  if (a === '' || a === 'l' || a === 'live') return 'live'
  if (a === 's' || a === 'sample') return 'sample'
  if (a === 'q' || a === 'quit') return 'quit'
  return null
}
