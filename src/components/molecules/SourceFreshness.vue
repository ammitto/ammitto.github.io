<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface Freshness {
  latestIncludedAnnouncementDate: string
  sourceSnapshotCommit: string
  sourceSnapshotCommittedAt: string
}
const snapshot = ref<Freshness | null>(null)
onMounted(async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}source-freshness.json`)
    if (!response.ok) return
    const { cn } = await response.json()
    if (/^\d{4}-\d{2}-\d{2}$/.test(cn?.latestIncludedAnnouncementDate)
      && /^[a-f0-9]{40}$/.test(cn?.sourceSnapshotCommit)
      && Number.isFinite(Date.parse(cn?.sourceSnapshotCommittedAt))) snapshot.value = cn
  } catch { /* Older/offline snapshots have no provenance metadata. */ }
})
</script>

<template>
  <div role="group" class="my-4 text-sm text-light-muted dark:text-dark-muted" aria-label="China source freshness">
    <p>Latest included source announcement: <strong class="text-light-text dark:text-dark-text">{{ snapshot?.latestIncludedAnnouncementDate || 'not recorded' }}</strong>.</p>
    <p v-if="snapshot">
      Repository snapshot:
      <a :href="`https://github.com/ammitto/data-cn/commit/${snapshot.sourceSnapshotCommit}`" class="text-brand-link underline">{{ snapshot.sourceSnapshotCommit.slice(0, 7) }}</a>
      (committed {{ snapshot.sourceSnapshotCommittedAt }}).
    </p>
    <p>Last manual import: not recorded. Last check of official sources: not recorded.</p>
    <p>Newer official announcements may need manual import. The repository commit and site build dates do not establish source freshness.</p>
  </div>
</template>
