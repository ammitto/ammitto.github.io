import type { RouteRecordRaw } from 'vue-router'

// Views
import HomePage from '@/views/HomePage.vue'
import SearchPage from '@/views/SearchPage.vue'
import ApiDocsPage from '@/views/ApiDocsPage.vue'
import EntityPage from '@/views/EntityPage.vue'
import AboutPage from '@/views/AboutPage.vue'
import RubyGemPage from '@/views/RubyGemPage.vue'
import SchemaPage from '@/views/SchemaPage.vue'
import SourcesPage from '@/views/SourcesPage.vue'
import BrowsePage from '@/views/BrowsePage.vue'
import BrowseEntitiesPage from '@/views/BrowseEntitiesPage.vue'
import BrowseSanctionsPage from '@/views/BrowseSanctionsPage.vue'
import BrowseActionsPage from '@/views/BrowseActionsPage.vue'
import OntologyBrowserPage from '@/views/OntologyBrowserPage.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomePage },
  { path: '/search', name: 'search', component: SearchPage },
  { path: '/api', name: 'api', component: ApiDocsPage },
  { path: '/entity/:id(.*)', name: 'entity', component: EntityPage },
  { path: '/about', name: 'about', component: AboutPage },
  { path: '/ruby', name: 'ruby', component: RubyGemPage },
  { path: '/schema', name: 'schema', component: SchemaPage },
  { path: '/sources', name: 'sources', component: SourcesPage },
  { path: '/browse', name: 'browse', component: BrowsePage },
  { path: '/browse/entities', name: 'browse-entities', component: BrowseEntitiesPage },
  { path: '/browse/sanctions', name: 'browse-sanctions', component: BrowseSanctionsPage },
  { path: '/browse/actions', name: 'browse-actions', component: BrowseActionsPage },
  { path: '/ontology', name: 'ontology', component: OntologyBrowserPage },
]

export default routes
