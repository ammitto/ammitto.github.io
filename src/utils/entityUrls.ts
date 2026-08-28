/**
 * Entity URL utilities
 *
 * Central location for generating entity URLs.
 * The website URL structure aligns with the IRI structure:
 * - IRI: https://www.ammitto.org/entity/uk/aqd0087
 * - URL: /entity/uk/aqd0087
 */

/**
 * Get the relative URL path for an entity
 * @param ref - Entity ref (e.g., "uk/aqd0087") or full IRI
 * @returns Relative URL path (e.g., "/entity/uk/aqd0087")
 */
export function getEntityUrl(ref: string): string {
  const entityRef = extractRef(ref)
  return `/entity/${entityRef}`
}

/**
 * Extract the ref from an IRI or return as-is if already a ref
 * @param idOrRef - Full IRI or ref
 * @returns Ref (e.g., "uk/aqd0087")
 */
export function extractRef(idOrRef: string): string {
  // Handle full IRI
  if (idOrRef.startsWith('https://www.ammitto.org/entity/')) {
    return idOrRef.replace('https://www.ammitto.org/entity/', '')
  }
  return idOrRef
}

/**
 * Get the API URL for loading an entity's node file
 * @param ref - Entity ref (e.g., "uk/aqd0087")
 * @returns API URL (e.g., "/api/v1/node/entity/uk/aqd0087.jsonld")
 */
export function getEntityApiUrl(ref: string): string {
  const entityRef = extractRef(ref)
  return `/api/v1/node/entity/${entityRef}.jsonld`
}

/**
 * The source code an entity ref belongs to, or null.
 *
 * Every entity IRI mirrors the publication layout — `/entity/{source}/{id}` —
 * so the source is already in the URL of the page being viewed. That matters
 * because it is frequently the ONLY place it appears: the published nodes
 * carry an empty `sourceReferences` array, checked live on 2026-08-28 against
 * both `node/entity/cn/1-general-dynamics.jsonld` and
 * `node/entity/uk/aqd0087.jsonld`. `useEntityData` derived the source from
 * that array alone, so it resolved to null and the entity page rendered an
 * empty grey badge between "Organization" and "active" — a record that never
 * names the authority that listed it.
 *
 * Returns null rather than guessing when the ref carries no source segment, so
 * a malformed ref surfaces as a missing badge rather than as a wrong one.
 */
export function sourceCodeFromRef(idOrRef: string): string | null {
  const ref = extractRef(idOrRef).replace(/^\/+/, '')
  const slash = ref.indexOf('/')
  if (slash <= 0) return null
  const code = ref.slice(0, slash)
  // Source codes are lowercase alphanumerics with underscores: un, eu,
  // un_vessels, eu_vessels. Anything else is not a source segment.
  return /^[a-z0-9_]+$/.test(code) ? code : null
}
