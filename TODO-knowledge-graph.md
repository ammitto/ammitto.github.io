# TODO: Knowledge Graph Website Integration

## Current State

### Website Architecture
- **Framework**: Vue 3 + Vite + vue-router + Vite-SSG (static site generation)
- **Search**: FlexSearch for client-side search
- **Styling**: Tailwind CSS
- **Location**: `/Users/mulgogi/src/ammitto/ammitto.github.io/`

### Current API Structure
The website expects:
```
api/v1/
├── search-index.json         # Lightweight search index
├── facets/                   # Facet counts for filters
│   ├── authorities.json
│   ├── list_types.json       # NEW - needs to be added
│   ├── regimes.json
│   ├── types.json
│   ├── countries.json
│   └── statuses.json
├── node/                     # Individual node files (MISSING!)
│   ├── entity/{source}/{id}.jsonld
│   ├── entry/{source}/{list_type}/{id}.jsonld
│   ├── list/{source}/{list_type}.jsonld
│   ├── authority/{code}.jsonld
│   ├── regime/{code}.jsonld
│   └── instrument/{source}/{id}.jsonld
├── by-list/                  # Browse by list type (MISSING!)
│   ├── {source}/
│   │   ├── {list_type}.jsonld
│   │   └── index.jsonld
│   └── index.jsonld
├── sources/{code}.jsonld     # Per-source combined data (EXISTS)
├── all.jsonld                # Combined graph (EXISTS)
└── stats.json                # Statistics (EXISTS)
```

### Current Routes
```
/                   - Home
/search             - Search entities
/entity/:id         - Entity detail page (expects ref format: "un/KPi.066")
/browse             - Browse landing
/browse/entities    - Browse entities
/browse/sanctions   - Browse sanctions
/browse/actions     - Browse actions
/ontology           - Ontology browser
```

### Current Composables
- `useSearchIndex.ts` - Loads search-index.json, FlexSearch, facets
- `useEntityData.ts` - Loads full entity from node files
- `useSanctionsData.ts` - Loads sanctions/entries data
- `useOntologyData.ts` - Loads ontology data

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
