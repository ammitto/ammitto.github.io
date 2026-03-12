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
