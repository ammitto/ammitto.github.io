/** Detail families resolved by the static host's 404 document. */
export const DETAIL_ROUTE_TITLES = {
  entity: 'Entity record',
  announcement: 'Official announcement',
  group: 'Sanctioned entities',
  'legal-instrument': 'Legal instrument',
  'document-type': 'Document type',
  organization: 'Issuing body',
} as const

export type DetailRouteName = keyof typeof DETAIL_ROUTE_TITLES
