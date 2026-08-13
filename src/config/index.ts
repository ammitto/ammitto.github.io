export const siteConfig = {
  name: 'Ammitto',
  tagline: 'Global Sanctions Data, Unified',
  description: 'Access sanctions data from EU, UN, US, and 10+ international sources through a single API.',
  url: 'https://www.ammitto.org',
  version: '1.0.0',
}

export const sources = [
  {
    code: 'un',
    name: 'United Nations',
    fullName: 'UN Security Council Consolidated List',
    country: 'UN',
    authority: 'UN Security Council',
    url: 'https://www.un.org/securitycouncil/sanctions/information',
    description: 'Consolidated list of individuals and entities subject to UN Security Council sanctions.',
    color: '#009edb',
  },
  {
    code: 'un_vessels',
    name: 'UN Vessels',
    fullName: 'UN Security Council Vessel List',
    country: 'UN',
    authority: 'UN Security Council',
    url: 'https://www.un.org/securitycouncil/sanctions/information',
    description: 'Vessels designated under UN Security Council sanctions.',
    color: '#0077be',
  },
  {
    code: 'au',
    name: 'Australia',
    fullName: 'DFAT Sanctions List',
    country: 'AU',
    authority: 'Department of Foreign Affairs and Trade (DFAT)',
    url: 'https://www.dfat.gov.au/international-relations/security/sanctions',
    description: 'Australian autonomous sanctions and UN Security Council sanctions.',
    color: '#00008b',
  },
  {
    code: 'ca',
    name: 'Canada',
    fullName: 'Canadian Sanctions List',
    country: 'CA',
    authority: 'Global Affairs Canada',
    url: 'https://www.international.gc.ca/world-monde/international_relations-relations_internationales/sanctions/index.aspx',
    description: 'Canadian autonomous sanctions and UN Security Council sanctions.',
    color: '#ff0000',
  },
  {
    code: 'ch',
    name: 'Switzerland',
    fullName: 'SECO Sanctions List',
    country: 'CH',
    authority: 'State Secretariat for Economic Affairs (SECO)',
    url: 'https://www.seco.admin.ch/seco/en/home/Aussenwirtschaft_Warenhandel_aussenwirtschaft_wirtschaft-zusammenarbeit/exportkontrolle-und-sanktionen/sanktionen-embargos.html',
    description: 'Swiss sanctions measures and embargoes.',
    color: '#da291c',
  },
  {
    code: 'cn',
    name: 'China',
    fullName: 'Unreliable Entity List / Anti-Sanctions List',
    country: 'CN',
    authority: 'MOFCOM / Ministry of Foreign Affairs',
    url: 'https://www.mofcom.gov.cn',
    description: 'China Unreliable Entity List and Countermeasures List.',
    color: '#de2910',
  },
  {
    code: 'eu',
    name: 'European Union',
    fullName: 'European Union Sanctions',
    country: 'EU',
    authority: 'European Commission',
    url: 'https://webgate.ec.europa.eu/fsd/fsf/',
    description: 'EU restrictive measures adopted under the Common Foreign and Security Policy.',
    color: '#003399',
  },
  {
    code: 'eu_vessels',
    name: 'EU Vessels',
    fullName: 'EU Sanctions Vessel List',
    country: 'EU',
    authority: 'European Commission',
    url: 'https://webgate.ec.europa.eu/fsd/fsf/',
    description: 'Vessels designated under EU sanctions.',
    color: '#0055aa',
  },
  {
    code: 'jp',
    name: 'Japan',
    fullName: 'Japanese Sanctions List',
    country: 'JP',
    authority: 'Ministry of Finance / Ministry of Foreign Affairs',
    url: 'https://www.mof.go.jp/english/policy/customs_tariff/trade_control/index.html',
    description: 'Japanese asset freeze and trade sanctions.',
    color: '#bc002d',
  },
  {
    code: 'nz',
    name: 'New Zealand',
    fullName: 'NZ Sanctions List',
    country: 'NZ',
    authority: 'Ministry of Foreign Affairs and Trade',
    url: 'https://www.mfat.govt.nz/en/peace-rights-and-security/sanctions/',
    description: 'New Zealand autonomous sanctions and UN Security Council sanctions.',
    color: '#000000',
  },
  {
    code: 'ru',
    name: 'Russia',
    fullName: 'Russia Stop-List',
    country: 'RU',
    authority: 'Ministry of Foreign Affairs (MID)',
    url: 'https://mid.ru',
    description: 'Russian entry bans and counter-sanctions.',
    color: '#0039a6',
  },
  {
    code: 'tr',
    name: 'Turkey',
    fullName: 'Turkish Sanctions List',
    country: 'TR',
    authority: 'Ministry of Foreign Affairs',
    url: 'https://www.mfa.gov.tr',
    description: 'Turkish sanctions and terrorism lists.',
    color: '#e30a17',
  },
  {
    code: 'uk',
    name: 'United Kingdom',
    fullName: 'UK Sanctions List',
    country: 'GB',
    authority: 'Office of Financial Sanctions Implementation (OFSI)',
    url: 'https://www.gov.uk/government/collections/uk-sanctions-regime',
    description: 'UK sanctions under the Sanctions and Anti-Money Laundering Act 2018.',
    color: '#012169',
  },
  {
    code: 'us',
    name: 'United States',
    fullName: 'OFAC Specially Designated Nationals',
    country: 'US',
    authority: 'Office of Foreign Assets Control (OFAC)',
    url: 'https://ofac.treasury.gov/',
    description: 'Specially Designated Nationals and Blocked Persons List (SDN List).',
    color: '#002868',
  },
  {
    code: 'wb',
    name: 'World Bank',
    fullName: 'World Bank Debarment List',
    country: 'WB',
    authority: 'World Bank Group',
    url: 'https://www.worldbank.org/en/projects-operations/procurement/debarred-firms',
    description: 'Firms and individuals ineligible to receive World Bank-financed contracts.',
    color: '#002244',
  },
] as const

/**
 * Legacy hyphenated source codes that older URLs and bookmarks may still
 * carry (the site previously linked /search?source=eu-vessels while the
 * data plane uses underscore codes). Maps legacy form -> canonical code.
 */
const LEGACY_SOURCE_CODES = new Map([
  ['eu-vessels', 'eu_vessels'],
  ['un-vessels', 'un_vessels'],
])

/**
 * Normalize a source code from an external input (e.g. URL query params),
 * mapping legacy hyphenated forms to the canonical underscore codes. A Map
 * keeps URL-controlled keys like __proto__ from hitting inherited object
 * properties.
 */
export function normalizeSourceCode(code: string): string {
  return LEGACY_SOURCE_CODES.get(code) ?? code
}

export const entityTypes = [
  { code: 'person', name: 'Person', color: '#f59e0b', icon: '👤' },
  { code: 'organization', name: 'Organization', color: '#10b981', icon: '🏢' },
  { code: 'vessel', name: 'Vessel', color: '#06b6d4', icon: '🚢' },
  { code: 'aircraft', name: 'Aircraft', color: '#8b5cf6', icon: '✈️' },
] as const

/**
 * The published lists an entry can appear on, as carried in each
 * search-index row's `listType`.
 *
 * The names are curated here rather than read from
 * `api/v1/facets/list_types.json`, which does supply a `name` but derives
 * it by title-casing the code: `sdn-list` arrives as "Sdn List", losing
 * the acronym OFAC's list is universally known by, and the hyphenated
 * forms this file already uses elsewhere ("Anti-Sanctions List").
 *
 * No `color` field: `sources`, `entityTypes` and `statuses` each colour by
 * something real — a flag, an entity kind, a severity — and a list type has
 * no such axis, so eight invented hex values would signal a meaning that is
 * not there. FilterPill renders fine without one.
 *
 * A code absent from this list renders no pill, the same tradeoff `sources`
 * and `statuses` already make against the facet files.
 */
export const listTypes = [
  { code: 'consolidated-list', name: 'Consolidated List' },
  { code: 'sdn-list', name: 'SDN List' },
  { code: 'end-user-list', name: 'End-User List' },
  { code: 'debarment-list', name: 'Debarment List' },
  { code: 'vessel-sanctions-list', name: 'Vessel Sanctions List' },
  { code: 'anti-sanction-list', name: 'Anti-Sanctions List' },
  { code: 'unreliable-entity-list', name: 'Unreliable Entity List' },
  // The producer's own value for an entry it could not place on a named
  // list, distinct from a row carrying no `listType` at all. Kept
  // selectable because every other selection excludes these rows, so
  // dropping the pill would make them unreachable through this facet.
  { code: 'unknown', name: 'Unknown' },
] as const

export const statuses = [
  { code: 'active', name: 'Active', color: '#ef4444' },
  { code: 'suspended', name: 'Suspended', color: '#f97316' },
  { code: 'delisted', name: 'Delisted', color: '#6b7280' },
  { code: 'terminated', name: 'Terminated', color: '#6b7280' },
  { code: 'expired', name: 'Expired', color: '#6b7280' },
] as const
