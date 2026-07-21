<script setup lang="ts">
import { useHead } from '@unhead/vue'

useHead({
  title: 'License - Ammitto',
  meta: [
    { name: 'description', content: 'Ammitto is truly free and open - no commercial licensing restrictions, no hidden fees, no vendor lock-in.' },
  ],
})
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-4xl font-bold mb-6 text-light-text dark:text-dark-text">
          License & Freedom
        </h1>

        <div class="prose-custom">
          <div class="glass-card p-6 mb-8 border-l-4 border-green-500">
            <h2 class="text-xl font-bold mb-2 text-green-600">Truly Free & Open</h2>
            <p class="text-light-text dark:text-dark-text mb-0">
              Unlike many "open" data services that restrict commercial use, Ammitto is released under
              <strong>CC0 1.0 Universal (Public Domain)</strong>. No attribution required. No restrictions. No catch.
            </p>
          </div>

          <h2>Why This Matters</h2>

          <p>
            Many sanctions data providers claim to be "open" while imposing significant restrictions:
          </p>

          <ul>
            <li><strong>Attribution requirements</strong> - You must display their logo, link back, or credit them</li>
            <li><strong>Non-commercial clauses</strong> - You can't use the data in commercial products</li>
            <li><strong>Share-alike provisions</strong> - Your derivatives must use the same license</li>
            <li><strong>API rate limits</strong> - Free tier is crippled to force paid upgrades</li>
            <li><strong>Registration walls</strong> - You must create an account and accept ToS</li>
            <li><strong>Vendor lock-in</strong> - Data formats are proprietary or poorly documented</li>
          </ul>

          <p>
            These restrictions transform "open data" into a marketing funnel. The data isn't truly free —
            you're just getting a sample to hook you into their commercial ecosystem.
          </p>

          <h2>Our Commitment</h2>

          <p>Ammitto is different:</p>

          <div class="grid sm:grid-cols-2 gap-4 my-6">
            <div class="glass-card p-4">
              <h3 class="font-semibold text-brand-primary mb-2">✓ No Attribution</h3>
              <p class="text-sm text-light-muted dark:text-dark-muted">
                Use our data without crediting us. We don't need marketing from forced attribution.
              </p>
            </div>
            <div class="glass-card p-4">
              <h3 class="font-semibold text-brand-primary mb-2">✓ Commercial OK</h3>
              <p class="text-sm text-light-muted dark:text-dark-muted">
                Build commercial products, charge for your services, keep all profits.
              </p>
            </div>
            <div class="glass-card p-4">
              <h3 class="font-semibold text-brand-primary mb-2">✓ No Registration</h3>
              <p class="text-sm text-light-muted dark:text-dark-muted">
                Download directly. No account, no API key, no tracking.
              </p>
            </div>
            <div class="glass-card p-4">
              <h3 class="font-semibold text-brand-primary mb-2">✓ Open Formats</h3>
              <p class="text-sm text-light-muted dark:text-dark-muted">
                JSON-LD with documented schemas. No proprietary formats or undocumented fields.
              </p>
            </div>
          </div>

          <h2>Formal License</h2>

          <div class="glass-card p-6 font-mono text-sm">
            <p class="mb-4"><strong>CC0 1.0 Universal (CC0 1.0)</strong></p>
            <p class="mb-4">Public Domain Dedication</p>
            <p class="text-light-muted dark:text-dark-muted">
              The person who associated a work with this deed has dedicated the work to the public domain
              by waiving all of their rights to the work worldwide under copyright law, including all
              related and neighboring rights, to the extent allowed by law.
            </p>
            <p class="mt-4 text-light-muted dark:text-dark-muted">
              You can copy, modify, distribute and perform the work, even for commercial purposes,
              all without asking permission.
            </p>
          </div>

          <h2 class="mt-8">Source Data Licenses</h2>

          <p>
            The underlying sanctions data comes from government sources that are generally public domain
            or have permissive licenses:
          </p>

          <ul>
            <li><strong>UN Security Council</strong> - Public domain (UN documents)</li>
            <li><strong>European Union</strong> - Public domain (EU official documents)</li>
            <li><strong>US OFAC</strong> - Public domain (US government work)</li>
            <li><strong>UK OFSI</strong> - Open Government Licence</li>
            <li><strong>World Bank</strong> - Public domain for debarment data</li>
          </ul>

          <p>
            Our harmonization, normalization, and schema design is also released under CC0.
          </p>

          <h2>Why We Do This</h2>

          <p>
            Compliance with sanctions shouldn't be gated behind paywalls or restricted by license terms.
            When the cost of compliance is high, smaller organizations and developing nations suffer most.
            By making this data truly free, we level the playing field.
          </p>

          <p>
            Sanctions themselves are already a burden — a "bad game" that entities are forced to play.
            The least we can do is ensure the rules of that game are freely accessible to everyone,
            not just those who can afford expensive compliance subscriptions.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
