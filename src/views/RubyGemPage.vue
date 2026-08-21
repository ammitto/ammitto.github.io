<script setup lang="ts">
import CodeBlock from '@/components/molecules/CodeBlock.vue'

// Every call below was executed against the gem before being written
// down. The page used to document `Ammitto::Client.new`, `client.entities`,
// `client.stats`, `config.base_url` and `config.cache_enabled` — none of
// which exist. `Ammitto::Client` is a namespace module, so `.new` raises
// NoMethodError, and so do both of those config setters. Nothing on this
// page ran.
const installCode = `# Add to Gemfile
gem 'ammitto'

# Or install directly
gem install ammitto`

const usageCode = `require 'ammitto'

# Search every source. Returns an Ammitto::Search::ResultSet.
results = Ammitto.search('bin laden')

# Narrow it: :sources, :limit and :offset are the options search accepts
eu_results = Ammitto.search('bin laden', sources: [:eu], limit: 25)

puts "Found #{results.size} of #{results.total_count}"

# Entries are entity objects. display_name is the string; primary_name
# returns a NameVariant, which is rarely what you want to print.
results.each do |entity|
  puts "#{entity.entity_type}: #{entity.display_name}"
end

# The set can slice itself without a second query
vessels = results.by_entity_type('vessel')
puts results.entity_types.inspect

# Which sources exist, and what is cached locally
puts Ammitto.sources.inspect
puts Ammitto.cache_status.inspect

# Refresh the local cache (~/.ammitto by default)
Ammitto.refresh_cache`

const railsCode = `# config/initializers/ammitto.rb
Ammitto.configure do |config|
  # Set this to the host that serves the API. Whatever you point it at
  # must answer directly: the client does not follow redirects, so a
  # host that 301s fails every download.
  config.api_base_url = 'https://www.ammitto.org/api/v1'
  config.cache_dir    = Rails.root.join('tmp', 'ammitto').to_s
  config.cache_ttl    = 3600 # seconds
end

# Usage in a Rails model or service
class SanctionsChecker
  def check_name(name)
    Ammitto.search(name, limit: 1).any?
  end

  def matches_for(name)
    Ammitto.search(name).map do |entity|
      { name: entity.display_name, type: entity.entity_type }
    end
  end
end`

const apiReference = [
  {
    call: 'Ammitto.search',
    params: 'term, sources:, limit:, offset:',
    description: 'Search entities by name. Returns a ResultSet of entity objects.',
  },
  {
    call: 'Ammitto.sources',
    params: 'none',
    description: 'The source codes the gem knows about, as symbols.',
  },
  {
    call: 'Ammitto.cache_status',
    params: 'none',
    description: 'Per-source cache state: whether it is present and how old.',
  },
  {
    call: 'Ammitto.refresh_cache',
    params: 'sources:, all:, force:',
    description: 'Re-download cached source data. Defaults to every source.',
  },
  {
    call: 'Ammitto.schema',
    params: 'none',
    description: 'The JSON-LD context the published documents reference.',
  },
  {
    call: 'Ammitto.configure',
    params: 'block',
    description: 'Set the options in the table below.',
  },
]

const resultSetMethods = [
  { call: 'each / map / first / last / []', description: 'Iterate the entity objects.' },
  { call: 'size / count / total_count', description: 'How many came back, and how many matched.' },
  { call: 'empty? / any?', description: 'Whether anything matched.' },
  { call: 'by_entity_type / by_authority / by_status', description: 'Slice the set without querying again.' },
  { call: 'entity_types / authorities', description: 'The distinct values present in this set.' },
  { call: 'to_json / to_json_ld', description: 'Serialize the set.' },
]

const configOptions = [
  // Deliberately not a URL. A host stated here would have to be kept in
  // step with whatever the gem ships as its default, and this page has no
  // way to notice when that changes. The sample above names a concrete
  // host because it is an override, which is a different claim.
  { name: 'api_base_url', description: 'Where source data is downloaded from', default: 'the live API host' },
  { name: 'cache_dir', description: 'Where downloaded source data is cached', default: '~/.ammitto' },
  { name: 'cache_ttl', description: 'Cache lifetime in seconds', default: '3600' },
  { name: 'connection_timeout', description: 'Connect timeout in seconds', default: '10' },
  { name: 'read_timeout', description: 'Read timeout in seconds', default: '30' },
  { name: 'verbose', description: 'Log what the client is doing', default: 'false' },
]
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
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-light-border dark:border-dark-border">
                  <th class="text-left p-4 font-semibold">Method</th>
                  <th class="text-left p-4 font-semibold">Parameters</th>
                  <th class="text-left p-4 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody class="text-light-muted dark:text-dark-muted">
                <tr
                  v-for="(entry, i) in apiReference"
                  :key="entry.call"
                  :class="i < apiReference.length - 1
                    ? 'border-b border-light-border dark:border-dark-border' : ''"
                >
                  <td class="p-4 font-mono text-sm whitespace-nowrap">{{ entry.call }}</td>
                  <td class="p-4 font-mono text-sm">{{ entry.params }}</td>
                  <td class="p-4">{{ entry.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Working with results
        </h2>
        <p class="text-light-muted dark:text-dark-muted mb-4 max-w-3xl">
          <code class="font-mono">Ammitto.search</code> returns a
          <code class="font-mono">ResultSet</code>. Its entries are entity
          objects, so reach for
          <code class="font-mono">display_name</code> to print a name —
          <code class="font-mono">primary_name</code> hands back a
          <code class="font-mono">NameVariant</code> object.
        </p>
        <div class="glass-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <tbody class="text-light-muted dark:text-dark-muted">
                <tr
                  v-for="(m, i) in resultSetMethods"
                  :key="m.call"
                  :class="i < resultSetMethods.length - 1
                    ? 'border-b border-light-border dark:border-dark-border' : ''"
                >
                  <td class="p-4 font-mono text-sm">{{ m.call }}</td>
                  <td class="p-4">{{ m.description }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="mb-12">
        <h2 class="text-2xl font-semibold mb-4 text-light-text dark:text-dark-text">
          Configuration Options
        </h2>
        <div class="glass-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-light-border dark:border-dark-border">
                  <th class="text-left p-4 font-semibold">Option</th>
                  <th class="text-left p-4 font-semibold">Description</th>
                  <th class="text-left p-4 font-semibold">Default</th>
                </tr>
              </thead>
              <tbody class="text-light-muted dark:text-dark-muted">
                <tr
                  v-for="(opt, i) in configOptions"
                  :key="opt.name"
                  :class="i < configOptions.length - 1
                    ? 'border-b border-light-border dark:border-dark-border' : ''"
                >
                  <td class="p-4 font-mono text-sm">{{ opt.name }}</td>
                  <td class="p-4">{{ opt.description }}</td>
                  <td class="p-4 font-mono text-sm">{{ opt.default }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
