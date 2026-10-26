<script setup lang="ts">
function reload() { window.location.reload() }
</script>

<template>
  <div class="container-wide py-12">
    <section role="alert" class="glass-card p-6">
      <h1 class="text-2xl font-semibold mb-4">This page could not load</h1>
      <p class="mb-4">Check your connection and try again.</p>
      <button type="button" class="btn-primary" @click="reload">Reload page</button>
    </section>
  </div>
</template>
