<script setup lang="ts">
import CodeBlock from '@/components/molecules/CodeBlock.vue'

const installCode = `# Add to Gemfile
gem 'ammitto'

# Or install directly
gem install ammitto`

const usageCode = `require 'ammitto'

# Initialize client
client = Ammitto::Client.new

# Get all EU entities
eu_entities = client.entities(source: 'eu')

# Search entities
results = client.search('bin laden')

# Get statistics
stats = client.stats

puts "Total entities: #{stats[:total_entities]}"

# Iterate over entities
eu_entities.each do |entity|
  puts entity.primary_name
end`

const railsCode = `# config/initializers/ammitto.rb
Ammitto.configure do |config|
  config.base_url = 'https://ammitto.github.io/api/v1'
  # Optional: Cache entities
  config.cache_enabled = true
  config.cache_ttl = 3600 # seconds
end

# Usage in a Rails model or service
class SanctionsChecker
  def initialize
    @client = Ammitto::Client.new
  end

  def check_name(name)
    results = @client.search(name)
    results.any?
  end
end`
</script>

<template>
  <div class="min-h-screen">
    <div class="container-wide py-12">
      <h1 class="text-4xl font-bold mb-4 text-light-text dark:text-dark-text">
        Ruby Gem
      </h1>
      <p class="text-light-muted dark:text-dark-muted mb-8 max-w-3xl">
        The Ammitto Ruby gem provides a simple interface for accessing sanctions data
        in your Ruby and Rails applications.
      </p>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Installation
        </h2>
        <CodeBlock
          :code="installCode"
          language="ruby"
          title="Gemfile"
        />
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Basic Usage
        </h2>
        <CodeBlock
          :code="usageCode"
          language="ruby"
          title="Basic Usage"
        />
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Rails Integration
        </h2>
        <CodeBlock
          :code="railsCode"
          language="ruby"
          title="Rails Configuration"
        />
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          API Reference
        </h2>
        <div class="glass-card overflow-hidden">
          <table class="w-full">
            <thead>
              <tr class="border-b border-light-border dark:border-dark-border">
                <th class="text-left p-4 font-semibold">Method</th>
                <th class="text-left p-4 font-semibold">Parameters</th>
                <th class="text-left p-4 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody class="text-light-muted dark:text-dark-muted">
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">client.entities</td>
                <td class="p-4">source: (optional)</td>
                <td class="p-4">Get all entities, optionally filtered by source</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">client.search</td>
                <td class="p-4">query, (optional params)</td>
                <td class="p-4">Search entities by name or keyword</td>
              </tr>
              <tr class="border-b border-light-border dark:border-dark-border">
                <td class="p-4 font-mono text-sm">client.entity</td>
                <td class="p-4">id</td>
                <td class="p-4">Get a specific entity by ID</td>
              </tr>
              <tr>
                <td class="p-4 font-mono text-sm">client.stats</td>
                <td class="p-4">none</td>
                <td class="p-4">Get statistics about available data</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Configuration Options
        </h2>
        <div class="glass-card p-6">
          <ul class="space-y-3 text-light-muted dark:text-dark-muted">
            <li>
              <code class="font-mono">base_url</code> - Base URL for the API (default: official API)
            </li>
            <li>
              <code class="font-mono">cache_enabled</code> - Enable caching (default: true)
            </li>
            <li>
              <code class="font-mono">cache_ttl</code> - Cache TTL in seconds (default: 3600)
            </li>
            <li>
              <code class="font-mono">timeout</code> - Request timeout in seconds (default: 30)
            </li>
          </ul>
        </div>
      </section>
    </div>
  </div>
</template>
