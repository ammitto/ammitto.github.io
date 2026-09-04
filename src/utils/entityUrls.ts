import { documentSegments } from './nodeDocuments.js'

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

const entityDocumentSegments = (ref: string): string[] | null =>
  documentSegments(extractRef(ref))

/**
 * Return the source segment of an entity ref after applying the same
 * validation used to address its published node document.
 *
 * An entity's `sourceReferences` describe claims in the record and are not
 * guaranteed to be present. The canonical ref still locates the entity under
 * `<source>/<id>`, so it is the reliable place to find the aggregate that
 * contains the record. Invalid catch-all route values must not be partially
 * recovered with a raw `split('/')`: if the node path is unsafe, there is no
 * aggregate link to offer either.
 *
 * @param ref - Entity ref (e.g., "uk/aqd0087") or full IRI
 * @returns The validated source code, or null when the ref is invalid
 */
export function getEntitySourceCode(ref: string): string | null {
  const segments = entityDocumentSegments(ref)
  return segments?.[0] ?? null
}

/**
 * Get the path of an entity's published node document.
 *
 * One expression with two callers: `loadFullEntity` fetches it and
 * `EntityPage` offers it to the reader. They each carried their own copy
 * of the string, alongside a third here that nothing called — so a test
 * comparing them could only report a divergence that had already
 * happened. Sharing the expression is what actually keeps the link and
 * the fetch in step.
 *
 * `base` is required on purpose. Defaulting it to `/` would leave the
 * same trap the unused `getEntityApiUrl` had: a caller that forgets it
 * gets a root-relative path that works in development and breaks
 * wherever the site is served from a subpath.
 *
 * `/entity/:id(.*)` is catch-all, so `ref` is whatever was in the address
 * bar. Segments are validated and encoded the way `nodeDocumentPath` does
 * it for the other node kinds: an id carrying `..`, an empty segment, a
 * `?` or a `#` would otherwise walk out of `node/entity/` or end the path
 * early, and the link would stop naming the record on the page.
 *
 * @param ref - Entity ref (e.g., "uk/aqd0087") or full IRI
 * @param base - Path the site is served from; pass `BASE_URL`
 * @returns API path, or null when the ref cannot address a document
 */
export function getEntityNodePath(ref: string, base: string): string | null {
  const segments = entityDocumentSegments(ref)
  if (!segments) return null

  const encoded = segments.map(encodeURIComponent).join('/')
  return `${base}api/v1/node/entity/${encoded}.jsonld`
}
