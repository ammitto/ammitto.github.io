# frozen_string_literal: true

# Scoped synthetic negative cases for the actual final-publication validator.
# The API page sample is illustrative; the captured HTTP fixture is unchanged.
require 'json'
require_relative 'publication-catalogue'

root = File.expand_path('..', __dir__)
spec = JSON.parse(File.read(File.join(root, 'public/openapi.json')))
page = File.read(File.join(root, 'src/views/ApiDocsPage.astro'))
sample_text = page.match(/response: `(\{.*?\n\})`/m)&.captures&.first
raise 'API catalogue sample missing' unless sample_text

sample = JSON.parse(sample_text)
PublicationCatalogue.validate!(sample, spec)

baseline = Marshal.load(Marshal.dump(sample))
baseline.fetch('entries').reject! { |entry| entry.fetch('name') != 'all.jsonld' }
%w[all.ttl sources/ru.ttl].each do |name|
  entry = Marshal.load(Marshal.dump(baseline.fetch('entries').first))
  entry['name'] = name
  entry['url'] = entry.fetch('url').sub('all.jsonld', File.basename(name))
  entry['mediaType'] = 'text/turtle'
  baseline.fetch('entries') << entry
end
PublicationCatalogue.validate!(baseline, spec)

mutations = {
  'wrong filename' => ->(value) { value['entries'][0]['url'].sub!('all.jsonld', 'all.ttl') },
  'wrong name' => ->(value) { value['entries'][0]['name'] = 'all.ttl' },
  'wrong media type' => ->(value) { value['entries'][0]['mediaType'] = 'text/html' },
  'zero bytes' => ->(value) { value['entries'][0]['bytes'] = 0 },
  'wrong tag' => ->(value) { value['entries'][0]['releaseTag'] = "api-v1-#{'c' * 40}" },
  'wrong commit' => ->(value) { value['entries'][0]['sourceCommit'] = 'c' * 40 },
  'wrong release time' => ->(value) { value['entries'][0]['published'] = '2026-10-19T10:00:00Z' },
  'wrong release URL' => ->(value) { value['bulkRelease']['url'] = 'https://github.com/other/data/releases/tag/wrong' },
  'missing bulk release' => ->(value) { value.delete('bulkRelease') },
  'wrong RU format' => ->(value) { value['entries'][2]['url'].sub!('ru.ttl', 'ru.jsonld') }
}
%w[published digest releaseTag sourceCommit].each do |field|
  mutations["missing #{field}"] = ->(value) { value['entries'][0].delete(field) }
end
mutations.each do |name, mutation|
  value = Marshal.load(Marshal.dump(baseline))
  mutation.call(value)
  begin
    PublicationCatalogue.validate!(value, spec)
  rescue StandardError
    next
  end
  raise "Malformed final catalogue accepted: #{name}"
end
puts "Publication catalogue: API-page sample valid; three bulk formats valid; #{mutations.length} malformed catalogues rejected"
