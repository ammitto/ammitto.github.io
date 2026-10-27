# Knowledge Graph Website Integration

This document describes the current repository and the status of the original
website integration plan. Reviewed against the Astro implementation on
2026-10-27. Checked items describe implemented behavior; unchecked items retain
unfinished work or decisions. Superseded proposals are identified separately.

## Current State

### Website Architecture

- **Repository:** `ammitto/ammitto.github.io`; website: https://www.ammitto.org.
- **Framework:** Astro 7 with Vite 8, Vue 3 components and interactive islands.
- **Styling:** Tailwind CSS 4 through `@tailwindcss/vite`.
- **Navigation:** native page links; Astro owns static routes and layouts.
  Documentation is static HTML with Vue copy controls, rather than whole-page
  Vue applications. There is no Vue Router or Vite-SSG entrypoint.
- **Search:** client-side FlexSearch with sharded source records, query-specific
  binary search partitions, verified asset caching and virtualized results.
- **Hosting:** static GitHub Pages. Direct record URLs use `404.html` and a Vue
  detail dispatcher, so they still return HTTP 404. This is not server rendering.
- **Build:** Node.js 22.23.4+; `npm run build` runs API preparation, Astro/Vue
  typechecks, the static build, search-runtime generation and publication
  finalization. See the [README](README.adoc) for development and deployment.

### Current API Structure

The API is generated static data, not a live query service. Discover current
files, collection members and publication metadata in
[`/api/v1/index.jsonld`](https://www.ammitto.org/api/v1/index.jsonld); do not use
this plan as a fixed list of source counts, identifiers or download sizes.

```text
api/v1/
├── index.jsonld                 # Publication catalogue
├── context.jsonld               # Shared JSON-LD context
├── stats.json                   # Publication counts
├── search-index/
│   ├── manifest.json            # Source-shard descriptors and metadata
│   └── {file}                   # Shards named by the manifest
├── facets/                      # authorities, regimes, types, statuses,
│                                # list_types; countries also has a file
├── sources/                     # Available per-source aggregates
├── node/
│   ├── entity/                  # Source/local ID paths and index.jsonld
│   ├── entry/                   # Source/list/entry ID paths and index.jsonld
│   ├── authority/
│   ├── regime/
│   ├── group/
│   ├── legal-instrument/
│   ├── organization/
│   └── document-type/
├── by-list/                     # Root/source indexes and list slices
├── by-authority/
├── by-regime/
├── by-type/
├── by-status/
├── by-organization/
├── by-document-type/
└── ontology/                    # Classes, properties, hierarchy and examples
```

Whole-graph JSON-LD/Turtle downloads and some large source exports are
catalogue entries pointing to GitHub Releases. Follow each entry's `url`;
`/api/v1/all.jsonld`, `/api/v1/all.ttl` and the old monolithic
`search-index.json` are not hosted API files. Search acceleration assets are
built separately under `/search-runtime/`, starting at `index.json`.

Entity and entry identifiers can contain several path segments. Resolve their
node downloads with the `.jsonld` suffix; a website entity URL is not its JSON-LD
download URL. The API uses `node/legal-instrument/`, not `node/instrument/`.
There is no `node/list/` collection: list slices live under `by-list/`.

The search page fetches five facet files: authorities, regimes, types, statuses
and list types. It deliberately does not load the country facet. A source being
named in the source catalogue does not by itself mean it publishes an aggregate;
`src/utils/sourceCatalog.ts` records that distinction.

See the [API and SPARQL guide](docs/api.adoc) and
[OpenAPI contract](public/openapi.json) for response envelopes and query examples.
Local development can use the committed CN sample or the published API; sample
behavior does not establish production-wide source coverage.

### Current Routes and Components

Static routes are Astro files under `src/pages/`:

```text
/                  /search             /api                /download
/about             /ruby               /schema             /sources
/browse            /browse/entities    /browse/sanctions   /browse/actions
/browse/legal-instruments              /browse/groups
/browse/announcements                  /browse/document-types
/browse/organizations                  /ontology            /license
```

Both slash and non-slash static URLs resolve; canonical URLs and sitemap entries
use trailing slashes. `src/components/DetailFallback.vue` dispatches the record
families declared in `src/utils/detailRoutes.ts`:

```text
/entity/{source}/{id}          /announcement/{source}/{id}
/group/{source}/{id}           /legal-instrument/{source}/{id}
/document-type/{source}/{id}   /organization/{source}/{id}
```

IDs may contain more segments. Unknown paths render the not-found view; arbitrary
record fallback URLs are excluded from the generated static sitemap.

| Component or composable | Current responsibility |
| --- | --- |
| `src/composables/useSearchIndex.ts` | Search data, facets, query preparation and individual entity-node loading |
| `src/composables/useEntityData.ts` | Entity identity, linked entries, listing status and legal bases |
| `src/composables/useSanctionsData.ts` | Published source aggregates and browse data |
| `src/composables/useOntologyData.ts` | Ontology definitions, hierarchy and examples |
| `src/composables/useScrollAnimation.ts` | Scroll animation behavior |
| `src/views/EntityPage.vue` | Entity details, memberships, listing evidence and source documents |

## Integration Status

### Phase 1: Data Publication — Implemented

- [x] Deploy through the gem's harmonization command and validate its output.
- [x] Publish individual entity, entry, authority and regime nodes, plus the
  supported related-node families and collection indexes.
- [x] Publish `by-list` slices and list-type facets.
- [x] Publish a search manifest and source shards carrying list-type metadata.

The original proposed exporter-script change and single `search-index.json`
were superseded by the current deployment and sharded publication pipeline.
A proposed `node/list` model was not implemented and is not required by the
current API. Current source coverage is a separate data-validation concern.

### Phase 2: Data Loading — Implemented for Current Pages

- [x] Carry `listType` in `SearchEntity` and expose list-type facets.
- [x] Load the entity node directly, without waiting for the search corpus.
- [x] Load referenced entry nodes using their complete source/list/entry paths.
- [x] Show entity list memberships and related listing evidence.

Entry loading is owned by `useEntityData`, not by the originally proposed
`loadFullEntry` addition to `useSearchIndex`. A separate `useListData.ts` was
not created; it belongs to the unimplemented dedicated-list-page proposal.

### Phase 3: Routes and Entity Details — Implemented with Revised Navigation

- [x] Resolve source-qualified entity and related-record URLs.
- [x] Display entity list memberships, listing effects, dates and status.
- [x] Show linked announcements, legal bases and supporting source documents.
- [x] Provide dedicated browse pages for the current related-record families.

**Remaining navigation decision:** the original `/entry/{source}/{list}/{id}`,
`/list/{source}/{list}` and `/browse/lists` pages were proposed but not shipped.
Current browse pages and entity listing evidence are the implemented navigation;
they do not amount to dedicated list pages with within-list filtering and
statistics. Decide whether those pages are still wanted before implementing
new routes, `EntryPage.vue`, `ListPage.vue` or `BrowseListsPage.vue`.

### Phase 4: Search — Filtering Implemented; Card Metadata Still Open

- [x] Filter by list type and load `list_types.json` facets.
- [x] Preserve query/filter state in the URL and browser history.
- [x] Link search results to their entity records.
- [ ] Carry `listType` through `src/utils/birthAdapters.ts`'s `searchRowToCard`
  and display it in `src/components/molecules/EntityCard.vue`.

Conditional links to separate entry pages depend on the Phase 3 navigation
decision; they are not part of the current entity-result contract.

### Phase 5: Semantic HTML and Representations — Open

- [ ] Decide which entity and related pages need embedded JSON-LD records, then
  add and validate them against `/api/v1/context.jsonld`.
- [ ] Define and add appropriate RDFa types, properties and resource references
  for semantic HTML. Published JSON-LD downloads do not implement HTML markup.
- [ ] Decide whether HTML/JSON-LD content negotiation and HTTP `Link` alternate
  headers are required, and choose hosting capable of serving that behavior.

Page titles, descriptions, canonical links and Open Graph metadata already exist;
embedded record JSON-LD and RDFa do not. The old proposed
`/ontology/context.jsonld` URL is not the published context contract.
GitHub Pages currently serves explicit `.jsonld` downloads and HTML record
fallbacks, not negotiated representations at the same URL.

### Phase 6: Performance — Partly Implemented

- [x] Fetch listing evidence after the entity identity becomes readable, with
  bounded concurrency rather than an unbounded request per entry.
- [x] Split record views into asynchronous modules and retain Vue islands for
  interactive behavior.
- [x] Shard source search data and load query-specific binary search partitions.
- [x] Cache verified search assets and use a bounded static-asset service worker.
- [x] Keep large search-result lists bounded through virtualized rendering.
- [ ] Profile entities with many listing references and decide whether listing
  evidence needs incremental loading or pagination; it currently loads all
  referenced entries with a concurrency cap.
- [ ] Evaluate bounded reuse of node and facet responses, with freshness,
  invalidation and retry rules. Existing search/static-asset caches do not
  provide a general API response cache; normal HTTP caching is separate.
- [ ] Measure whether preloading common entities would help before introducing
  extra background requests or a byte budget for them.
- [ ] Measure whether deferring the eager FlexSearch import improves startup.

## Validation and Next Work

Existing implementation checks live alongside the code:

| Area | Existing checks |
| --- | --- |
| API response families and publication | `scripts/verify-api-contract.rb`, `scripts/test-publication-catalogue.rb`, deployment validation |
| Entity/entry identifiers and evidence | `tests/entityUrls.test.js`, `tests/entryAdapters.test.js`, `tests/entryWiring.test.js`, `tests/entryFetchPool.test.js` |
| List-type filters and query state | `tests/searchFilters.test.js`, `tests/searchFilterWiring.test.js`, `tests/e2e/search-workflow.spec.js` |
| Record source documents | `tests/e2e/entity-source-documents.spec.js` |
| Static routes and island boundaries | `scripts/verify-astro-routes.mjs`, `tests/e2e/astro-islands.spec.js` |
| Search acceleration and caching | `tests/searchRuntime.test.js`, `tests/searchRuntimeBinary.test.js`, `tests/e2e/search-runtime.spec.js` |

Use the README's build and test entrypoints when changing those areas. The
unchecked items above need their own implementation and validation; this
status update does not mark them complete. In particular, dedicated entry/list
page tests and semantic-markup tests should follow the corresponding scope
decisions rather than require pages that do not exist.

The smallest concrete UI follow-up is list-type metadata on search cards.
Semantic HTML, new navigation and hosting changes need separate scope decisions;
performance work should start with measurement of the current implementation.
