/**
 * Search worker: verifies, inflates and fully validates one saved-index
 * partition off the main thread, then hands the decoded bytes back
 * (transferred, not copied). The page re-parses only the small header and
 * term dictionary of a buffer this worker accepted. Same code as the
 * in-page path; any failure is reported and the page treats the partition
 * as invalid.
 */
import { inflate, searchBytesDigest } from './searchBytes.js'
import { decodeSearchRuntimeBinary } from './searchRuntimeBinary.js'

export interface PartRequest {
  id: number
  bytes: ArrayBuffer
  sha256: string
  decodedBytes: number
  entityCount: number
  registeredCount: number
  part: number
}
export type PartReply = { id: number; ok: true; decoded: ArrayBuffer } | { id: number; ok: false }

export async function validatePart(request: Omit<PartRequest, 'id'>): Promise<ArrayBuffer> {
  if (await searchBytesDigest(request.bytes) !== request.sha256) throw new Error('Incompatible saved search index')
  const decoded = await inflate(request.bytes, request.decodedBytes)
  await decodeSearchRuntimeBinary(decoded, request.entityCount, request.registeredCount, request.part)
  return decoded
}

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PartRequest>) => void) | null
  postMessage: (message: PartReply, transfer?: Transferable[]) => void
  document?: unknown
}
if (typeof scope.document === 'undefined' && typeof scope.postMessage === 'function' && 'onmessage' in scope) {
  scope.onmessage = async ({ data }) => {
    try {
      const decoded = await validatePart(data)
      scope.postMessage({ id: data.id, ok: true, decoded }, [decoded])
    } catch {
      scope.postMessage({ id: data.id, ok: false })
    }
  }
}
