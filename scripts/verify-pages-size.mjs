import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const PAGE_ARCHIVE_LIMIT = 950_000_000

export async function measureArchive(directory) {
  if (!directory || !(await stat(directory)).isDirectory()) throw new Error('A publication directory is required')
  // Match upload-pages-artifact's GNU tar exclusions and format. Stream the
  // actual archive so headers/padding count without a second GB on disk.
  return new Promise((accept, reject) => {
    const tar = spawn('tar', ['--dereference', '--hard-dereference', '-cf', '-', '--exclude=.git', '--exclude=.github', '-C', directory, '.'], { stdio: ['ignore', 'pipe', 'inherit'] })
    let bytes = 0
    tar.stdout.on('data', chunk => { bytes += chunk.length })
    tar.on('error', reject)
    tar.on('close', code => code === 0 ? accept(bytes) : reject(new Error(`tar exited ${code}`)))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const bytes = await measureArchive(process.argv[2])
    console.log(`Pages archive: ${bytes} bytes; gate ${PAGE_ARCHIVE_LIMIT}; headroom ${1_000_000_000 - bytes} bytes below supported 1GB`)
    if (bytes >= PAGE_ARCHIVE_LIMIT) throw new Error('Pages archive exceeds the publication gate')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
