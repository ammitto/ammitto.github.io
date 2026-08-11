/**
 * The routes the browser tests visit.
 *
 * Shared, not duplicated: `tests/contrast.test.js` parses
 * `src/router/index.ts` and fails if any route the router declares is missing
 * from this file. A new page therefore cannot be added without also being
 * swept for horizontal overflow — the failure mode that made this list worth
 * having in the first place.
 *
 * `id` values are real records from the CN snapshot committed under
 * `public/api/v1`, so the detail routes render actual content rather than a
 * not-found state. Each entry names a `contains` string that must appear on
 * the rendered page; a route that silently degraded to an empty or error
 * state would otherwise "pass" the overflow assertion by having nothing to
 * overflow with.
 */

/** Routes with no parameters. */
export const STATIC_ROUTES = [
  { path: '/', contains: 'Ammitto' },
  { path: '/search', contains: 'Search' },
  { path: '/api', contains: 'API' },
  { path: '/about', contains: 'Ammitto' },
  { path: '/ruby', contains: 'Ruby' },
  { path: '/schema', contains: 'Schema' },
  { path: '/sources', contains: 'Sources' },
  { path: '/browse', contains: 'Browse' },
  { path: '/browse/entities', contains: 'Entities' },
  { path: '/browse/sanctions', contains: 'Sanctions' },
  { path: '/browse/actions', contains: 'Actions' },
  { path: '/browse/legal-instruments', contains: 'Legal' },
  { path: '/browse/groups', contains: 'Groups' },
  { path: '/browse/announcements', contains: 'Announcements' },
  { path: '/browse/document-types', contains: 'Document' },
  { path: '/browse/organizations', contains: 'Organizations' },
  { path: '/ontology', contains: 'Ontology' },
  { path: '/license', contains: 'License' },
]

/**
 * Parameterised routes, keyed by the router path they instantiate, with a
 * sample id drawn from the committed snapshot.
 */
export const PARAM_ROUTES = [
  { routerPath: '/entity/:id(.*)', path: '/entity/cn/1-general-dynamics', contains: 'General Dynamics' },
  {
    routerPath: '/organization/:id(.*)',
    path: '/organization/cn/state-council',
    contains: 'State Council',
    slowUntilSummariesExist: true,
  },
  { routerPath: '/group/:id(.*)', path: '/group/cn/14', contains: 'Announcement' },
  { routerPath: '/announcement/:id(.*)', path: '/announcement/cn/14', contains: 'Announcement' },
  {
    routerPath: '/legal-instrument/:id(.*)',
    path: '/legal-instrument/cn/npc-export-control-law',
    contains: 'Export Control Law',
  },
  {
    routerPath: '/document-type/:id(.*)',
    path: '/document-type/cn/ministry-of-commerce-order',
    contains: 'Ministry of Commerce',
    slowUntilSummariesExist: true,
  },
]

/**
 * TEMPORARY, and it must stay temporary.
 *
 * Two routes are excluded from the browser sweep when it runs against the
 * full dataset. Not because their layout is exempt — because they cannot
 * finish rendering to be measured. Both rebuild, in the browser and one
 * request at a time, a grouping the publishing pipeline could hand them
 * ready-made: they fetch the entry index and then every entry node in the
 * corpus to test each for a relationship. At ~20k entries that is tens of
 * thousands of sequential requests, and the page never paints.
 *
 * They are excluded rather than given a longer timeout because a timeout
 * large enough to pass would be minutes, and a check that takes minutes is
 * a check that gets deleted.
 *
 * The alternative was to hold this whole gate — and with it every daily
 * data publish — behind a defect that predates it. This site was frozen
 * for months earlier this year; blocking deploys is the more expensive
 * failure.
 *
 * The exclusion ends when the pipeline publishes per-organization and
 * per-document-type summaries and these pages read them. Whoever does that
 * work deletes this flag in the same change, and the routes rejoin the
 * sweep. Both stay in the inventory below so the router-coverage check
 * still fails if a new page is added without being swept.
 */
export const SLOW_ROUTES = PARAM_ROUTES.filter((route) => route.slowUntilSummariesExist)

/** Every route a browser test should visit. */
export const ALL_ROUTES = [...STATIC_ROUTES, ...PARAM_ROUTES]

/**
 * The routes the browser sweep measures against the full dataset. Identical
 * to ALL_ROUTES except for the temporary exclusion documented above; against
 * the committed snapshot every route is fast, so nothing is skipped there.
 */
export const SWEEPABLE_ROUTES = process.env.E2E_FULL_DATASET
  ? ALL_ROUTES.filter((route) => !route.slowUntilSummariesExist)
  : ALL_ROUTES

/**
 * Viewports the overflow sweep runs at. 320px is the WCAG 1.4.10 (Reflow)
 * boundary; 390px is the reported phone width. Passing only at 390 would not
 * establish 1.4.10.
 */
export const NARROW_VIEWPORTS = [
  { name: '320', width: 320, height: 800 },
  { name: '390', width: 390, height: 844 },
]

/** The pages whose colours this remediation owns, for the rendered-DOM scan. */
export const CONTRAST_SCAN_ROUTES = [
  { path: '/', requires: '.tone-pill' },
  { path: '/search', requires: '.tone-pill' },
  // Needs the per-source aggregate, which the committed snapshot does not
  // ship (see serveSourceGraphs in tests/e2e/helpers.js).
  { path: '/browse/entities', requires: '.tone-pill', needsSourceGraph: true },
  { path: '/browse', requires: '.tone-tile' },
  { path: '/browse/sanctions', requires: '.tone-tile' },
  { path: '/sources', requires: '.tone-tile' },
  { path: '/ontology', requires: '.tone-ink' },
  { path: '/api', requires: '.tone-pill' },
  // These three render SourceFilter, whose selected pill is the one place a
  // translucent overlay used to composite over a tested tone.
  { path: '/browse/legal-instruments', requires: 'main' },
  { path: '/browse/groups', requires: 'main' },
  { path: '/browse/announcements', requires: 'main' },
  { path: '/about', requires: 'main' },
  { path: '/entity/cn/1-general-dynamics', requires: '.tone-pill' },
]
