/**
 * The node-document path builder.
 *
 * These are BEHAVIOURAL checks: they import the helper and call it, so
 * they fail when its output changes, not merely when its source text
 * does. That matters more here than in the wiring files, because the
 * thing being asserted is what a URL comes out as.
 *
 * Every route reaching these builders is declared catch-all in
 * `router/index.ts` (`:id(.*)`), so the identifier is whatever the
 * visitor typed. The rejection cases below are that fact, written down.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  documentSegments,
  nodeDocumentPath,
  nodeDocumentLabel,
} from '../.test-build/utils/nodeDocuments.js'

test('builds the path a page fetches, for a plain identifier', () => {
  assert.equal(
    nodeDocumentPath('legal-instrument', 'cn/2025-14', '/'),
    '/api/v1/node/legal-instrument/cn/2025-14.jsonld',
  )
})

test('honours a subpath base', () => {
  assert.equal(
    nodeDocumentPath('organization', 'cn/mofcom', '/ammitto/'),
    '/ammitto/api/v1/node/organization/cn/mofcom.jsonld',
  )
})

test('refuses to walk out of the node directory', () => {
  // Interpolated raw this resolved to /api/v1/secret.jsonld.
  assert.equal(nodeDocumentPath('group', '../../secret', '/'), null)
  assert.equal(nodeDocumentPath('group', 'cn/../../secret', '/'), null)
  assert.equal(documentSegments('a/./b'), null)
})

test('refuses an identifier with an empty segment', () => {
  assert.equal(nodeDocumentPath('group', 'cn//x', '/'), null)
  assert.equal(nodeDocumentPath('group', '', '/'), null)
})

test('keeps a query or fragment character inside the path', () => {
  // Raw, the `?` ended the path and made the rest a query string, so the
  // link stopped naming the document the page was showing.
  assert.equal(
    nodeDocumentPath('document-type', 'cn/a?b', '/'),
    '/api/v1/node/document-type/cn/a%3Fb.jsonld',
  )
  assert.equal(
    nodeDocumentPath('document-type', 'cn/a#b', '/'),
    '/api/v1/node/document-type/cn/a%23b.jsonld',
  )
})

test('preserves the separator between segments', () => {
  const path = nodeDocumentPath('group', 'cn/2025/14', '/')
  assert.equal(path, '/api/v1/node/group/cn/2025/14.jsonld')
})

test('replaces every separator in the filename, not just the first', () => {
  // `id.replace('/', '-')` replaced one, so a two-slash identifier kept a
  // slash in what was presented to the reader as a filename.
  assert.equal(nodeDocumentLabel('cn/2025/14'), 'cn-2025-14.jsonld')
  assert.equal(nodeDocumentLabel('cn/2025-14'), 'cn-2025-14.jsonld')
  assert.equal(nodeDocumentLabel('../../secret'), null)
})
