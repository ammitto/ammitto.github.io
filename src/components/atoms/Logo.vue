<script setup lang="ts">
// Full logo with icon and text - references external SVG
</script>

<template>
  <RouterLink
    to="/"
    class="flex items-center hover:opacity-80 transition-opacity logo-link"
  >
    <img
      src="/assets/ammitto-logo_full.svg"
      alt="Ammitto"
      class="h-10 w-auto logo-img"
    />
  </RouterLink>
</template>

<style scoped>
.logo-link {
  height: 40px;
}

.logo-img {
  height: 40px;
  width: auto;
}

/* Dark mode: invert the text color to lighter blue */
.dark .logo-img {
  filter: brightness(1.3) saturate(0.9);
}
</style>
