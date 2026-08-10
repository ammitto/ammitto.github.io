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
  { routerPath: '/organization/:id(.*)', path: '/organization/cn/state-council', contains: 'State Council' },
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
  },
]

/** Every route a browser test should visit. */
export const ALL_ROUTES = [...STATIC_ROUTES, ...PARAM_ROUTES]

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
