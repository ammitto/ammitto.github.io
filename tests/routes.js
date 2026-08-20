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
  // The catch-all. `routerPath` is the pattern the router declares; `path`
  // is a URL that matches nothing else, which is the only way to reach it.
  // It is here rather than in STATIC_ROUTES because the two differ: every
  // other entry visits the path it declares.
  {
    routerPath: '/:pathMatch(.*)*',
    path: '/no-such-page-exists',
    contains: 'Page not found',
  },
  { routerPath: '/entity/:id(.*)', path: '/entity/cn/1-general-dynamics', contains: 'General Dynamics' },
  {
    routerPath: '/organization/:id(.*)',
    path: '/organization/cn/state-council',
    contains: 'State Council',
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
  },
]

/**
 * Every route a browser test should visit, and every route the sweep
 * measures. One list, no environment-conditional subset: the same routes are
 * measured against the committed snapshot and against the fifteen-source
 * dataset the deploy workflow harmonizes.
 *
 * It was not always one list. The organization and document-type routes were
 * excluded from the full-dataset run, because both pages rebuilt their
 * document lists in the browser by fetching the entry index and then every
 * entry node in the corpus — tens of thousands of sequential requests, so at
 * ~25k entries the page never painted and there was nothing to measure. Both
 * pages now fetch one published summary instead
 * (`by-organization/{identifier}.jsonld`,
 * `by-document-type/{identifier}.jsonld`; see OrganizationPage.vue and
 * DocumentTypePage.vue), so they paint in one request and rejoin the sweep.
 *
 * Read this before excluding them again. The two runs render these pages
 * differently and both are in scope. The gem revision the deploy workflow
 * pins emits the summaries — `Publish organization and document-type page
 * summaries` is an ancestor of the pinned 5e8b95c, and was not an ancestor of
 * the 3db2e4ea it replaced — so a full-dataset run gets the real lists. The
 * committed snapshot in `public/api/v1` ships no `by-organization/` or
 * `by-document-type/` directory at all, so a local run takes the
 * `summaryUnavailable` branch and renders the "lists are unavailable" notice.
 * Neither is a reason to exclude the routes:
 *
 *  - This sweep measures horizontal overflow, and a page that renders fast
 *    is a page that can be measured — which is the only thing the exclusion
 *    was ever about. Both branches render in one request.
 *  - Each route's `contains` sentinel ("State Council", "Ministry of
 *    Commerce") comes from the node fetch that draws the page header, not
 *    from the summary, so an absent summary cannot degrade the route into
 *    the empty render the sentinel exists to catch.
 *  - The local run is therefore the weaker of the two measurements, not a
 *    different one: whatever the deploy build lays out, it lays out with more
 *    content in the same boxes.
 *
 * What would justify an exclusion is a page that cannot finish rendering.
 * Neither of these can be that again without first losing its summary fetch.
 */
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
  // translucent overlay used to composite over a tested tone. `.tone-tile`
  // is that pill: SourceFilter puts the class on whichever option is
  // selected, and the "All" option is selected on a bare visit, so the
  // component under test is on screen whenever it rendered at all. A generic
  // `main` here proved only that the page shell existed — it would have
  // stayed green with the pill missing entirely, which is the one thing
  // these three routes are in this list to check.
  { path: '/browse/legal-instruments', requires: '.tone-tile' },
  { path: '/browse/groups', requires: '.tone-tile' },
  { path: '/browse/announcements', requires: '.tone-tile' },
  { path: '/about', requires: 'main' },
  { path: '/entity/cn/1-general-dynamics', requires: '.tone-pill' },
]
