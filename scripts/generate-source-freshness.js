import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Coverage is what the snapshot contains, never a claim about notices that
// authorities may have published since the last manual collection.
export function sourceFreshness(graph, commit, committedAt, builtAt) {
  if (!Array.isArray(graph?.['@graph'])) throw new Error('CN source graph is missing')
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Invalid CN snapshot commit')
  if (!Number.isFinite(Date.parse(committedAt)) || !Number.isFinite(Date.parse(builtAt))) {
    throw new Error('Invalid snapshot timestamp')
  }
  const dates = []
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') {
      if ([value['@type']].flat().includes('OfficialAnnouncement') && value.publishDate) {
        const date = value.publishDate
        if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
          || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
          throw new Error('Invalid CN announcement publication date')
        }
        dates.push(date)
      }
      Object.values(value).forEach(visit)
    }
  }
  visit(graph)
  if (!dates.length) throw new Error('CN snapshot contains no dated announcements')
  return {
    cn: {
      latestIncludedAnnouncementDate: dates.sort().at(-1),
      sourceSnapshotCommit: commit,
      sourceSnapshotCommittedAt: committedAt,
      snapshotBuiltAt: builtAt,
      lastManualImportAt: null,
      lastOfficialSourceCheckAt: null,
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [repo, api, output] = process.argv.slice(2)
  if (!repo || !api || !output) throw new Error('Usage: generate-source-freshness.js DATA_CN_REPO API_DIRECTORY OUTPUT_FILE')
  const git = args => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
  const result = sourceFreshness(JSON.parse(readFileSync(resolve(api, 'sources/cn.jsonld'), 'utf8')),
    git(['rev-parse', 'HEAD']), git(['show', '-s', '--format=%cI', 'HEAD']), new Date().toISOString())
  writeFileSync(resolve(output), `${JSON.stringify(result, null, 2)}\n`)
}
