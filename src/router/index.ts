import type { RouteRecordRaw } from 'vue-router'

// Views
import HomePage from '@/views/HomePage.vue'
import SearchPage from '@/views/SearchPage.vue'
import ApiDocsPage from '@/views/ApiDocsPage.vue'
import EntityPage from '@/views/EntityPage.vue'
import AnnouncementPage from '@/views/AnnouncementPage.vue'
import GroupPage from '@/views/GroupPage.vue'
import LegalInstrumentPage from '@/views/LegalInstrumentPage.vue'
import AboutPage from '@/views/AboutPage.vue'
import RubyGemPage from '@/views/RubyGemPage.vue'
import SchemaPage from '@/views/SchemaPage.vue'
import SourcesPage from '@/views/SourcesPage.vue'
import BrowsePage from '@/views/BrowsePage.vue'
import BrowseEntitiesPage from '@/views/BrowseEntitiesPage.vue'
import BrowseSanctionsPage from '@/views/BrowseSanctionsPage.vue'
import BrowseActionsPage from '@/views/BrowseActionsPage.vue'
import BrowseLegalInstrumentsPage from '@/views/BrowseLegalInstrumentsPage.vue'
import BrowseGroupsPage from '@/views/BrowseGroupsPage.vue'
import BrowseAnnouncementsPage from '@/views/BrowseAnnouncementsPage.vue'
import BrowseDocumentTypesPage from '@/views/BrowseDocumentTypesPage.vue'
import BrowseOrganizationsPage from '@/views/BrowseOrganizationsPage.vue'
import DocumentTypePage from '@/views/DocumentTypePage.vue'
import OrganizationPage from '@/views/OrganizationPage.vue'
import OntologyBrowserPage from '@/views/OntologyBrowserPage.vue'
import LicensePage from '@/views/LicensePage.vue'

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomePage },
  { path: '/search', name: 'search', component: SearchPage },
  { path: '/api', name: 'api', component: ApiDocsPage },
  { path: '/entity/:id(.*)', name: 'entity', component: EntityPage },
  { path: '/announcement/:id(.*)', name: 'announcement', component: AnnouncementPage },
  { path: '/group/:id(.*)', name: 'group', component: GroupPage },
  { path: '/legal-instrument/:id(.*)', name: 'legal-instrument', component: LegalInstrumentPage },
  { path: '/document-type/:id(.*)', name: 'document-type', component: DocumentTypePage },
  { path: '/organization/:id(.*)', name: 'organization', component: OrganizationPage },
  { path: '/about', name: 'about', component: AboutPage },
  { path: '/ruby', name: 'ruby', component: RubyGemPage },
  { path: '/schema', name: 'schema', component: SchemaPage },
  { path: '/sources', name: 'sources', component: SourcesPage },
  { path: '/browse', name: 'browse', component: BrowsePage },
  { path: '/browse/entities', name: 'browse-entities', component: BrowseEntitiesPage },
  { path: '/browse/sanctions', name: 'browse-sanctions', component: BrowseSanctionsPage },
  { path: '/browse/actions', name: 'browse-actions', component: BrowseActionsPage },
  { path: '/browse/legal-instruments', name: 'browse-legal-instruments', component: BrowseLegalInstrumentsPage },
  { path: '/browse/groups', name: 'browse-groups', component: BrowseGroupsPage },
  { path: '/browse/announcements', name: 'browse-announcements', component: BrowseAnnouncementsPage },
  { path: '/browse/document-types', name: 'browse-document-types', component: BrowseDocumentTypesPage },
  { path: '/browse/organizations', name: 'browse-organizations', component: BrowseOrganizationsPage },
  { path: '/ontology', name: 'ontology', component: OntologyBrowserPage },
  { path: '/license', name: 'license', component: LicensePage },
]

export default routes
