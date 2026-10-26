<script setup lang="ts">
// Full logo with icon and text - references external SVG
</script>

<template>
  <a
    href="/"
    aria-label="Ammitto home"
    class="inline-flex shrink-0 items-center logo-link"
  >
    <img
      src="/assets/ammitto-logo_full.svg"
      alt="Ammitto"
      width="140"
      height="40"
      class="h-10 w-auto logo-img"
    />
  </a>
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
