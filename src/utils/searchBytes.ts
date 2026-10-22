/** Byte helpers shared by the page and the search worker (no FlexSearch). */
function fail(): never { throw new Error('Incompatible saved search index') }

export async function searchBytesDigest(bytes: ArrayBuffer): Promise<string> {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function inflate(bytes: ArrayBuffer, expectedBytes: number): Promise<ArrayBuffer> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const chunks: BlobPart[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > expectedBytes) fail()
      chunks.push(value)
    }
    if (size !== expectedBytes) fail()
    return await new Blob(chunks).arrayBuffer()
  } finally {
    await reader.cancel().catch(() => {})
  }
}

