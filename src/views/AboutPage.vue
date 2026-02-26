<script setup lang="ts">
import { useScrollAnimation } from '@/composables/useScrollAnimation'

useScrollAnimation()
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-4xl font-bold mb-6 text-light-text dark:text-dark-text">About Ammitto</h1>

        <div class="prose-custom">
          <p>
            Ammitto is an open-source project that provides unified access to global sanctions data
            from multiple international sources. Our mission is to make sanctions data more
            accessible and easier to use for compliance, research, and transparency purposes.
          </p>

          <h2>What We Do</h2>
          <p>
            We aggregate sanctions data from official government sources including the United Nations,
            European Union, United States (OFAC), and other international authorities. The data is
            normalized into a consistent format and made available through a free API.
          </p>

          <h2>Data Sources</h2>
          <p>
            We aggregate sanctions data from 15 official sources worldwide:
          </p>
          <ul>
            <li><strong>United Nations</strong> - UN Security Council Consolidated List</li>
            <li><strong>European Union</strong> - EU Sanctions Map & Vessels List</li>
            <li><strong>United States</strong> - OFAC SDN and Consolidated Lists</li>
            <li><strong>United Kingdom</strong> - UK Sanctions List</li>
            <li><strong>Australia</strong> - DFAT Consolidated List</li>
            <li><strong>Canada</strong> - SEMA and Special Economic Measures</li>
            <li><strong>Switzerland</strong> - SECO Sanctions List</li>
            <li><strong>China</strong> - MOFCOM and MFA Sanctions</li>
            <li><strong>Russia</strong> - MID Unfriendly Countries List</li>
            <li><strong>Turkey</strong> - Ministry of Foreign Affairs</li>
            <li><strong>Japan</strong> - METI End User List</li>
            <li><strong>New Zealand</strong> - MFAT Sanctions Register</li>
            <li><strong>World Bank</strong> - Debarment List</li>
          </ul>

          <h2>Technology</h2>
          <p>
            The project is built with modern web technologies including Vue.js, Vite, and FlexSearch
            for fast client-side search. Data is provided in JSON-LD format for semantic web
            compatibility. We also provide a Ruby gem for easy integration.
          </p>

          <h2>Open Source</h2>
          <p>
            Ammitto is open source and we welcome contributions. The source code is available on
            GitHub. You can use the API freely for non-commercial purposes.
          </p>

          <h2>Contact</h2>
          <p>
            For questions or suggestions, please open an issue on GitHub or contact us through
            our website.
          </p>
        </div>

        <div class="mt-12 p-6 glass-card">
          <h3 class="font-semibold text-lg mb-4 text-light-text dark:text-dark-text">
            Quick Links
          </h3>
          <ul class="space-y-2">
            <li>
              <RouterLink to="/api" class="text-brand-primary hover:underline">
                API Documentation
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/schema" class="text-brand-primary hover:underline">
                Data Schema
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/sources" class="text-brand-primary hover:underline">
                Data Sources
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/ruby" class="text-brand-primary hover:underline">
                Ruby Gem
              </RouterLink>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
