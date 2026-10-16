<script setup lang="ts">
import { useHead } from '@unhead/vue'

useHead({
  title: 'About - Ammitto',
  meta: [
    { name: 'description', content: 'Understanding Ammitto - our philosophy, name origin, and mission to democratize sanctions compliance data.' },
  ],
})

</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <div class="max-w-3xl mx-auto">
        <h1 class="text-4xl font-bold mb-6 text-light-text dark:text-dark-text">
          About Ammitto
        </h1>

        <div class="prose-custom">
          <p class="lead">
            Ammitto brings published sanctions records into a common structure so that people
            can search names, compare identifying details and follow the source evidence.
          </p>
          <p>
            Start with <RouterLink to="/search">Search</RouterLink> or
            <RouterLink to="/browse">Browse data</RouterLink>. Developers can use the
            <RouterLink to="/api">API</RouterLink>, <RouterLink to="/ruby">Ruby gem</RouterLink>
            or <RouterLink to="/download">downloadable files</RouterLink>.
            Questions and contributions are welcome in the
            <a href="https://github.com/ammitto/ammitto.github.io" target="_blank" rel="noopener noreferrer">GitHub repository<span class="sr-only"> (opens in a new tab)</span></a>.
          </p>

          <h2 id="coverage">Coverage and source dates</h2>
          <p>
            The <RouterLink to="/sources">source catalogue</RouterLink> identifies the authorities
            and lists covered by Ammitto, their published coverage and any data that is not yet available.
            Records retain their source context and available references.
          </p>
          <p>
            A build date describes the published copy. Each source is collected separately and can
            be older than that date. Consult the source information for recorded collection dates
            and distinguish unavailable dates from known ones.
          </p>

          <nav aria-label="On this page" class="my-7 border-y border-light-border dark:border-dark-border py-4">
            <p class="!mb-2 text-sm font-semibold">About the project</p>
            <ul class="!mb-0 !list-none flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <li><a href="#perspective">Perspective</a></li>
              <li><a href="#name">Name</a></li>
              <li><a href="#logo">Logo</a></li>
              <li><a href="#role">Our role</a></li>
              <li><a href="#license">License</a></li>
              <li><a href="#technology">Technology</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </nav>

          <h2 id="perspective">Project perspective</h2>
          <p class="lead text-xl text-light-muted dark:text-dark-muted">
            Ammitto is a free, open-source platform providing unified access to global sanctions data.
            But it's more than a database — it's a response to the fractured, arbitrary, and often
            hypocritical system of international sanctions.
          </p>

          <h2 id="name">The Name: Ammitto</h2>

          <p>
            Our name comes from the Latin verb <em>amittere</em> — "to lose" or "to send away."
            This word operates on multiple levels, capturing the essence of what sanctions do:
          </p>

          <ul>
            <li>
              <strong>For the sanctioned entity:</strong> They "lose" access to financial systems,
              trade opportunities, and international engagement. They are "sent away" from the
              global community.
            </li>
            <li>
              <strong>For compliance officers:</strong> They must identify who to "let go of" —
              which business relationships to terminate, which transactions to block.
            </li>
            <li>
              <strong>For the platform itself:</strong> Ammitto encompasses both the action
              (excluding entities) and the knowledge (who has been excluded).
            </li>
          </ul>

          <p>
            The name is linguistically elegant and functionally descriptive. It captures what
            sanctions do — cause loss — while sounding authoritative and international.
          </p>

          <h2 id="logo">Our Logo: Three Eyes</h2>

          <p>
            Our logo depicts three stylized eyes arranged in a circular, non-hierarchical pattern.
            This isn't random design — it represents the reality of modern sanctions:
          </p>

          <div class="glass-card p-6 my-6">
            <h3 class="font-semibold text-lg mb-3 text-light-text dark:text-dark-text">
              The Three-Way Gaze
            </h3>
            <ol>
              <li>
                <strong>The Enforcer:</strong> One entity imposes sanctions, watching their target
              </li>
              <li>
                <strong>The Target:</strong> The sanctioned entity watches back, imposing counter-sanctions
              </li>
              <li>
                <strong>The Third Party:</strong> Everyone else is watched by both, forced to choose sides
              </li>
            </ol>
          </div>

          <p>
            But here's the crucial insight: these roles aren't fixed. Each eye simultaneously:
          </p>

          <ul>
            <li><strong>Watches</strong> (enforces its own restrictions)</li>
            <li><strong>Is watched</strong> (is targeted by others' restrictions)</li>
            <li><strong>Judges</strong> (decides whom to exclude)</li>
          </ul>

          <p>
            Russia counters Western sanctions with export bans on strategic materials.
            China maintains an "unreliable entity list" responding to US restrictions.
            Iran and North Korea build sanction-resistant financial networks.
            Each becomes both enforcer and target.
          </p>

          <p>
            The three eyes aren't hierarchical — they're circular. Each stares at the other two.
            None is dominant. This visualizes how sanctions create a fragmented world where
            everyone is simultaneously enforcer, target, and judge.
          </p>

          <h2>The "Bad Game" of Sanctions</h2>

          <p>
            Sanctions are often portrayed as a clean, surgical diplomatic tool — "smart power"
            that avoids military conflict. This narrative is incomplete at best, deceptive at worst.
          </p>

          <h3>The Unfairness</h3>

          <p>
            Imagine a playground where one kid tells everyone else: "If you want to be my friend,
            you can't play with that kid over there." Now imagine three kids doing this simultaneously,
            each demanding their friends choose sides. That's the sanctions system.
          </p>

          <p>
            The unfairness multiplies:
          </p>

          <ul>
            <li>
              <strong>Ordinary people suffer</strong> — sanctions rarely hurt the elites they target,
              but they devastate civilians through inflation, shortages, and isolation
            </li>
            <li>
              <strong>Small actors are coerced</strong> — a bank in Kenya or a trading company in
              Vietnam must comply with US, EU, UK, and Chinese restrictions simultaneously,
              even when those restrictions conflict
            </li>
            <li>
              <strong>Rules are arbitrary</strong> — who gets sanctioned often depends more on
              geopolitics than on consistent criteria
            </li>
            <li>
              <strong>The powerful exempt themselves</strong> — sanctions have carve-outs for
              "national interests" that let the imposers continue business as usual
            </li>
          </ul>

          <h3>The Hypocrisy</h3>

          <p>
            Consider: the same governments that impose sanctions for "human rights violations"
            often maintain relationships with other violators who happen to be strategic allies.
            The same entities that demand compliance from others have themselves been sanctioned
            by someone else.
          </p>

          <p>
            We don't take sides in these disputes. We simply observe: the system is riddled with
            contradictions. Ammitto exists to make these contradictions visible.
          </p>

          <h2 id="role">What We Do</h2>

          <p>
            Given this reality, what is Ammitto's role? We don't endorse sanctions — but we
            recognize that organizations must navigate this system to survive.
          </p>

          <p>
            <strong>We help you protect yourself.</strong>
          </p>

          <p>
            By providing free, open, comprehensive sanctions data, we enable:
          </p>

          <ul>
            <li>
              <strong>Small businesses</strong> to understand their compliance obligations without
              expensive consultants
            </li>
            <li>
              <strong>Developing nations</strong> to access the same data as wealthy countries
            </li>
            <li>
              <strong>Researchers and journalists</strong> to analyze patterns in sanctions regimes
            </li>
            <li>
              <strong>Civil society</strong> to hold sanctioning bodies accountable for consistency
            </li>
          </ul>

          <h2 id="license">Truly Free and Open</h2>

          <p>
            Unlike many "open" data services, Ammitto is released under
            <RouterLink to="/license" class="text-brand-link hover:underline">CC0 (Public Domain)</RouterLink>.
            No attribution required. No commercial restrictions. No catch.
          </p>

          <p>
            We believe that compliance with sanctions — whether you agree with them or not —
            shouldn't be gated behind paywalls. When the cost of compliance is high, the smallest
            actors suffer most. We level the playing field.
          </p>

          <h2 id="technology">Technology</h2>

          <p>
            Ammitto is built with modern web technologies:
          </p>

          <ul>
            <li><strong>Frontend:</strong> Vue.js 3, Vite, Tailwind CSS</li>
            <li><strong>Search:</strong> FlexSearch for fast client-side full-text search</li>
            <li><strong>Data Format:</strong> JSON-LD for semantic web compatibility</li>
            <li><strong>Ontology:</strong> Custom schema for harmonized sanctions data</li>
            <li><strong>Ruby Gem:</strong> Official gem for easy integration</li>
          </ul>

          <h2 id="contact">Contact</h2>

          <p>
            Ammitto is an open-source project. For questions, suggestions, or contributions,
            please visit our <a href="https://github.com/ammitto/ammitto.github.io" target="_blank" rel="noopener noreferrer">GitHub repository<span class="sr-only"> (opens in a new tab)</span></a>.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lead {
  font-size: 1.25rem;
  line-height: 1.6;
}
</style>
