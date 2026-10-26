/** Preserve client-bundle provenance because Astro removes Vite's manifest. */
export default function captureBuildAssets() {
  return {
    name: 'ammitto-capture-client-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Astro shares plugin instances across Vite environments. Inspect the
      // executing hook environment, not configResolved's last environment.
      if (this.environment.name !== 'client') return
      const files = Object.values(bundle).map(entry => entry.fileName)
        .filter(file => file.startsWith('assets/')).sort()
      this.emitFile({
        type: 'asset',
        fileName: 'ammitto-static-assets.json',
        source: JSON.stringify({ version: 1, files }),
      })
    },
  }
}
