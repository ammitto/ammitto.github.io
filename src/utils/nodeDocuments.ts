/**
 * Paths to the published node documents a page is rendered from.
 *
 * Five views built these paths inline, each with its own copy of the
 * `api/v1/node/<kind>/` prefix, and each interpolating a route parameter
 * straight into it. Every route that reaches them is declared catch-all
 * (`:id(.*)` in `router/index.ts`), so the parameter is whatever the
 * visitor put in the address bar: it can carry slashes, dot segments, a
 * `?` or a `#`. Interpolated raw, `../../x` walks out of `api/v1/node/`
 * and a `?` turns the rest of the path into a query string, so the link
 * offered to the reader stops naming the document the page is showing.
 *
 * Entity pages already avoided the copy by sharing `getEntityNodePath`;
 * this is the same idea for the other five kinds, with the validation
 * the catch-all routes make necessary.
 */

/**
 * Node kinds this builder addresses.
 *
 * There is no `announcement` kind. An announcement is a field on each
 * entry rather than a document of its own, which is why AnnouncementPage
 * offers the `group` node it actually fetched -- see the comment at
 * `AnnouncementPage.vue:298`. Naming it here would have made a dead link
 * a compile-time-valid thing to ask for.
 *
 * `entity` is absent for a different reason: it has its own builder,
 * `getEntityNodePath`, because an entity ref can arrive as a full IRI and
 * has to be extracted first.
 */
export type NodeKind =
  | 'document-type'
  | 'group'
  | 'legal-instrument'
  | 'organization'

/**
 * Split an identifier into path segments, rejecting anything that would
 * not address a document under the node directory.
 *
 * Empty segments, `.` and `..` are rejected rather than cleaned: a
 * caller handing those in is working from a URL that never named a real
 * document, and silently rewriting it would offer a link to a different
 * one.
 *
 * @param id - identifier, possibly containing `/` (e.g. `cn/2025-14`)
 * @returns the segments, or null when the identifier cannot address a document
 */
export function documentSegments(id: string): string[] | null {
  if (!id) return null

  const segments = id.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null

  return segments
}

/**
 * Path of the published node document for one identifier.
 *
 * Each segment is encoded separately, so a `?`, `#` or space inside an
 * identifier stays part of the path instead of becoming a delimiter,
 * while the `/` between segments is preserved.
 *
 * `base` is required for the reason `getEntityNodePath` gives: a default
 * of `/` works in development and breaks on a subpath.
 *
 * @param kind - node kind, naming the directory it is published under
 * @param id - identifier, possibly containing `/`
 * @param base - path the site is served from; pass `BASE_URL`
 * @returns the path, or null when the identifier cannot address a document
 */
export function nodeDocumentPath(
  kind: NodeKind,
  id: string,
  base: string,
): string | null {
  const segments = documentSegments(id)
  if (!segments) return null

  const encoded = segments.map(encodeURIComponent).join('/')
  return `${base}api/v1/node/${kind}/${encoded}.jsonld`
}

/**
 * Filename offered for a node document.
 *
 * Segments are encoded as in `nodeDocumentPath`, with one addition:
 * `encodeURIComponent` leaves `*` untouched (valid in a URL path, not in a
 * Windows filename), so it is escaped here as well. Every separator is
 * replaced, not just the first.
 *
 * @param id - identifier, possibly containing `/`
 * @returns the filename, or null when the identifier cannot address a document
 */
export function nodeDocumentLabel(id: string): string | null {
  const segments = documentSegments(id)
  if (!segments) return null

  // encodeURIComponent deliberately leaves `*` untouched. That is valid in
  // a URL path but not in a Windows filename, so the download label needs the
  // one extra escape that the URL builder does not.
  const encoded = segments.map((segment) =>
    encodeURIComponent(segment).replace(/\*/g, '%2A')
  )
  return `${encoded.join('-')}.jsonld`
}
