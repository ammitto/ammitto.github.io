# TODO: Knowledge Graph Website Integration

> **Status, checked 2026-09-14.** This is the original planning document,
> written before any of it shipped, and most of it has been overtaken since.
> Phase 1 landed: `node/` documents, `by-list/` slices and
> `facets/list_types.json` are all published today. Phase 2's search work and
> Phase 4 landed: `SearchEntity` carries `listType` and `useSearchIndex.ts`
> loads all six facet files. Phase 3 was superseded rather than built: the
> site grew `/browse/groups`, `/browse/organizations`, `/browse/document-types`,
> `/browse/announcements` and `/browse/legal-instruments` instead of the
> `/entry`, `/list` and `/browse/lists` routes proposed below, and
> `useListData.ts`, `EntryPage.vue`, `ListPage.vue` and `BrowseListsPage.vue`
> were never created. Phase 5 (JSON-LD script tags, RDFa, content negotiation)
> and Phase 6 are still open.
>
> The "Current State" section below has been corrected against the deployed
> API and this checkout. Everything from "Phase 1" down is left as written:
> those unchecked boxes record what was planned, not what is true.

## Current State

### Website Architecture
- **Framework**: Vue 3 + Vite + vue-router + Vite-SSG (static site generation)
- **Search**: FlexSearch for client-side search
- **Styling**: Tailwind CSS
- **Repository**: `ammitto/ammitto.github.io`

### Current API Structure
What `https://www.ammitto.org/api/v1` actually serves, read from its own
catalogue at `/index.jsonld` on 2026-09-14:

```
api/v1/
├── index.jsonld              # Catalogue: every file with its byte size,
│                             #   every collection with its members
├── search-index.json         # Search index (20 MB)
├── stats.json                # Per-source and total counts
├── context.jsonld            # The context every document here references
├── all.jsonld                # Whole graph, JSON-LD (156 MB)
├── all.ttl                   # Whole graph, Turtle (116 MB)
├── sources/{code}.jsonld     # One aggregate per source (14 today)
├── facets/                   # authorities, countries, list_types,
│                             #   regimes, statuses, types
├── node/                     # One document per node, by type: entity,
│                             #   entry, authority, regime, group,
│                             #   legal-instrument, organization,
│                             #   document-type — each with an index.jsonld
├── by-list/                  # Browse by list type
├── by-authority/             # 14 members
├── by-regime/                # 179 members
├── by-type/                  # 4 members
├── by-status/                # 2 members
├── by-organization/
├── by-document-type/
└── ontology/                 # classes.jsonld, properties.jsonld,
                              #   hierarchy.json
```

Two of the paths proposed below were never published: there is no
`node/list/` (those slices live under `by-list/`) and no `node/instrument/`
(legal instruments are at `node/legal-instrument/`). Both return 404.

### Current Routes
Read from `src/router/index.ts`:

```
/                          - Home
/search                    - Search entities
/api                       - API documentation
/entity/:id(.*)            - Entity detail
/announcement/:id(.*)      - Announcement detail
/group/:id(.*)             - Group detail
/legal-instrument/:id(.*)  - Legal instrument detail
/document-type/:id(.*)     - Document type detail
/organization/:id(.*)      - Organization detail
/about                     - About
/ruby                      - Ruby gem
/schema                    - Schema
/sources                   - Sources
/browse                    - Browse landing
/browse/entities           - Browse entities
/browse/sanctions          - Browse sanctions
/browse/actions            - Browse actions
/browse/legal-instruments  - Browse legal instruments
/browse/groups             - Browse groups
/browse/announcements      - Browse announcements
/browse/document-types     - Browse document types
/browse/organizations      - Browse organizations
/ontology                  - Ontology browser
/license                   - License
/:pathMatch(.*)*           - Not found (must stay last)
```

### Current Composables
- `useSearchIndex.ts` - Loads search-index.json, FlexSearch, and all six
  facet files including `list_types.json`; `SearchEntity` carries `listType`
- `useEntityData.ts` - Loads a full entity from its node file
- `useSanctionsData.ts` - Loads sanctions/entries data
- `useOntologyData.ts` - Loads ontology data
- `useScrollAnimation.ts` - Scroll-triggered animation helper

---

## Phase 1: Fix Data Export

### 1.1 Update Export to Generate Node Files
**File**: `ammitto/scripts/export_knowledge_graph.rb`

Current exporter only generates combined files. Need to also generate:
- [ ] Individual entity node files: `node/entity/{source}/{id}.jsonld`
- [ ] Individual entry node files: `node/entry/{source}/{list_type}/{id}.jsonld`
- [ ] Individual list node files: `node/list/{source}/{list_type}.jsonld`
- [ ] Individual authority node files: `node/authority/{code}.jsonld`
- [ ] Individual regime node files: `node/regime/{code}.jsonld`

**Note**: The `JsonLdGraphExporter` class already has this capability. Need to integrate it into the main export script.

### 1.2 Update Export to Generate Search Index
- [ ] Generate `search-index.json` with new IRI format
- [ ] Include `listType` field in search entities
- [ ] Generate `facets/list_types.json`

### 1.3 Generate By-List Slices
- [ ] Generate `by-list/{source}/{list_type}.jsonld` for each list
- [ ] Generate `by-list/{source}/index.jsonld`
- [ ] Generate `by-list/index.jsonld`

---

## Phase 2: Update Website Data Loading

### 2.1 Update useSearchIndex.ts
**File**: `src/composables/useSearchIndex.ts`

Current entity loading uses: `api/v1/node/entity/${ref}.jsonld`

Update to handle new IRI structure:
```typescript
// OLD: ref = "un/KPi.066" -> node/entity/un/KPi.066.jsonld
// NEW: ref = "un/KPi.066" -> node/entity/un/KPi.066.jsonld (same for entities)

// But entries need list_type:
// ref = "cn/import-export-control-list/entry-id" -> node/entry/cn/import-export-control-list/entry-id.jsonld
```

- [ ] Add `listType` to SearchEntity interface
- [ ] Update `loadFullEntity` to handle entry refs with list_type
- [ ] Add `loadFullEntry` function
- [ ] Add `listTypeFacets` to returned facets

### 2.2 Update useEntityData.ts
**File**: `src/composables/useEntityData.ts`

- [ ] Add entries loading (entries for this entity across all lists)
- [ ] Add list membership display (which lists this entity is on)
- [ ] Add related entries section

### 2.3 Create useListData.ts (NEW)
**File**: `src/composables/useListData.ts`

- [ ] Load list definition from `node/list/{source}/{list_type}.jsonld`
- [ ] Load entries for a list from `by-list/{source}/{list_type}.jsonld`
- [ ] Get list statistics

---

## Phase 3: Update Website Routes

### 3.1 Add New Routes
**File**: `src/router/index.ts`

```typescript
// Current
/entity/:id(.*)           // Entity page

// Add
/entity/:source/:id       // Entity (normalized: entity/cn/mitsubishi)
/entry/:source/:list_type/:id  // Entry (normalized: entry/cn/import-export-control-list/mitsubishi)
/list/:source/:list_type  // List page
/browse/lists             // Browse by list type
```

- [ ] Add `/entity/:source/:id` route
- [ ] Add `/entry/:source/:list_type/:id` route
- [ ] Add `/list/:source/:list_type` route
- [ ] Add `/browse/lists` route

### 3.2 Update EntityPage.vue
**File**: `src/views/EntityPage.vue`

- [ ] Show all lists the entity appears on
- [ ] Show entries for each list with list-specific data
- [ ] Link to entry pages
- [ ] Add JSON-LD structured data for SEO

### 3.3 Create EntryPage.vue (NEW)
**File**: `src/views/EntryPage.vue`

- [ ] Display entry-specific information (measures, dates, status)
- [ ] Link back to entity
- [ ] Link to list
- [ ] Show announcement reference
- [ ] Show legal instruments

### 3.4 Create ListPage.vue (NEW)
**File**: `src/views/ListPage.vue`

- [ ] Display list metadata (name, authority, description)
- [ ] Show entries on this list
- [ ] Filter/search within list
- [ ] Statistics (total entries, by type, by status)

### 3.5 Create BrowseListsPage.vue (NEW)
**File**: `src/views/BrowseListsPage.vue`

- [ ] Show all lists by source
- [ ] Filter by source
- [ ] Show entry counts per list

---

## Phase 4: Update Search Functionality

### 4.1 Update SearchEntity Interface
```typescript
export interface SearchEntity {
  id: string
  ref: string                    // "source/local_id" for entity
  type: 'person' | 'organization' | 'vessel' | 'aircraft'
  names: string[]
  primaryName: string
  country?: string
  regime?: string
  authority?: string
  listType?: string              // NEW
  status?: string
  birthYear?: string
  imo?: string
}
```

### 4.2 Update Search Filters
- [ ] Add list type filter
- [ ] Update facet loading to include list_types.json
- [ ] Update filter() function to handle listType

### 4.3 Update Search Results Display
- [ ] Show list type in search results
- [ ] Link to correct entity/entry page based on result type

---

## Phase 5: Ontology Compliance

### 5.1 Add JSON-LD Context
- [ ] Ensure all pages include proper JSON-LD context
- [ ] Use `@context: https://www.ammitto.org/ontology/context.jsonld`
- [ ] Include semantic markup for:
  - Entity (Person, Organization, Vessel, Aircraft)
  - SanctionEntry
  - SanctionsList
  - Authority
  - LegalInstrument

### 5.2 Add Semantic HTML
- [ ] Use RDFa attributes where appropriate
- [ ] Add `typeof` attributes for entity types
- [ ] Add `property` attributes for fields
- [ ] Use `resource` for IRI references

### 5.3 Add Content Negotiation
- [ ] Support both HTML and JSON-LD content types
- [ ] Add `Link` headers for alternate representations
- [ ] Add JSON-LD script tags in HTML head

---

## Phase 6: Performance Optimization

### 6.1 Lazy Loading
- [ ] Lazy load entry data when entity is displayed
- [ ] Lazy load list membership data
- [ ] Paginate long lists of entries

### 6.2 Caching
- [ ] Cache loaded node files
- [ ] Cache facet data
- [ ] Preload common entities

### 6.3 Bundle Optimization
- [ ] Code-split by route
- [ ] Lazy load FlexSearch
- [ ] Optimize search index size

---

## Implementation Order

1. **Phase 1**: Fix data export (gem side)
2. **Phase 2**: Update data loading (website composables)
3. **Phase 3**: Add new routes and pages
4. **Phase 4**: Update search
5. **Phase 5**: Ontology compliance
6. **Phase 6**: Performance

---

## Testing Checklist

### Data Export
- [ ] Node files generated correctly
- [ ] IRIs follow normalized structure
- [ ] Search index includes listType
- [ ] Facets include list_types.json

### Entity Pages
- [ ] Entity loads from node file
- [ ] All lists shown
- [ ] Entries for each list displayed
- [ ] Links to entries work

### List Pages
- [ ] List definition loads
- [ ] Entries load from by-list slice
- [ ] Filtering works
- [ ] Statistics displayed

### Search
- [ ] List type filter works
- [ ] Results show list type
- [ ] Links navigate correctly

### Ontology
- [ ] JSON-LD valid
- [ ] Context resolves
- [ ] Semantic markup present
- [ ] SEO meta tags present

---

## Key Files to Modify

### Ruby Gem
| File | Change |
|------|--------|
| `scripts/export_knowledge_graph.rb` | Integrate JsonLdGraphExporter |
| `lib/ammitto/exporter/knowledge_graph_exporter.rb` | Add node file generation |

### Website
| File | Change |
|------|--------|
| `src/composables/useSearchIndex.ts` | Add listType support |
| `src/composables/useEntityData.ts` | Add entries/lists loading |
| `src/composables/useListData.ts` | NEW - list data loading |
| `src/router/index.ts` | Add new routes |
| `src/views/EntityPage.vue` | Show lists and entries |
| `src/views/EntryPage.vue` | NEW - entry detail page |
| `src/views/ListPage.vue` | NEW - list detail page |
| `src/views/BrowseListsPage.vue` | NEW - browse lists page |
