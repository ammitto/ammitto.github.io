import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSanctionsData, type SanctionEntity } from './useSanctionsData'

export function useEntityData() {
  const route = useRoute()
  const { entities, loadAllEntities, loading, error } = useSanctionsData()

  const entity = ref<SanctionEntity | null>(null)
  const entityLoading = ref(false)
  const entityError = ref<string | null>(null)

  const loadEntity = async (id: string) => {
    entityLoading.value = true
    entityError.value = null

    try {
      // Ensure entities are loaded
      if (entities.value.length === 0) {
        await loadAllEntities()
      }

      // Find the entity
      const found = entities.value.find(e => e.id === id)
      if (found) {
        entity.value = found
      } else {
        entityError.value = 'Entity not found'
      }
    } catch (e) {
      entityError.value = e instanceof Error ? e.message : 'Failed to load entity'
    } finally {
      entityLoading.value = false
    }
  }

  const primaryName = computed(() => {
    if (!entity.value) return null
    const primary = entity.value.names.find(n => n.isPrimary)
    return primary?.fullName || entity.value.names[0]?.fullName || 'Unknown'
  })

  const aliases = computed(() => {
    if (!entity.value) return []
    return entity.value.names.filter(n => !n.isPrimary).map(n => n.fullName)
  })

  const entityId = computed(() => route.params.id as string)

  return {
    entity,
    entityLoading,
    entityError,
    loadEntity,
    entityId,
    primaryName,
    aliases,
    loading,
    error,
  }
}
