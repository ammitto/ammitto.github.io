# frozen_string_literal: true

# Real JSON Schema validation over bounded, dated HTTP response fixtures.
# This is a development/CI gate, not a production website dependency.
require 'json'
require 'json_schemer'
require 'set'

ROOT = File.expand_path('..', __dir__)
spec = JSON.parse(File.read(File.join(ROOT, 'public/openapi.json')))
fixture = JSON.parse(File.read(File.join(ROOT, 'tests/fixtures/openapi-responses.json')))
cases = fixture.fetch('cases')

schema_for = lambda do |schema|
  JSONSchemer.schema(schema.merge(
    '$schema' => 'https://json-schema.org/draft/2020-12/schema',
    'components' => spec.fetch('components')
  ))
end
assert = lambda { |condition, message| abort(message) unless condition }

# Coverage belongs to the declared contract, not a hand-maintained subset.
# Every path must have a response fixture; every combination of enum-valued
# path parameters must occur. Identifiers without an enum use dated examples.
spec.fetch('paths').each do |template, path|
  operation = path.fetch('get')
  matching = cases.select { |item| item.fetch('template') == template }
  assert.call(!matching.empty?, "No fixture for #{template}")
  names = template.scan(/\{([^}]+)\}/).flatten.sort
  parameters = operation.fetch('parameters', [])
  assert.call(names == parameters.map { |p| p.fetch('name') }.sort,
              "Parameter declarations differ from path: #{template}")
  enums = parameters.select { |p| p.fetch('schema').key?('enum') }
  combinations = enums.reduce([{}]) do |rows, parameter|
    rows.flat_map do |row|
      parameter.fetch('schema').fetch('enum').map { |value| row.merge(parameter.fetch('name') => value) }
    end
  end
  combinations.each do |selection|
    assert.call(matching.any? { |item| selection.all? { |key, value| item.fetch('parameters')[key] == value } },
                "Missing parameter branch #{template}: #{selection}")
  end
end

# Locate required fields at every populated level of a response. Validation
# and branch selection remain JSONSchemer's work; this only generates negative
# examples. It follows actual data, so recursive schemas terminate naturally.
required_paths = lambda do |schema, data, path = []|
  if schema.key?('$ref')
    name = schema.fetch('$ref').delete_prefix('#/components/schemas/')
    next required_paths.call(spec.fetch('components').fetch('schemas').fetch(name), data, path)
  end
  if schema.key?('allOf')
    next schema.fetch('allOf').flat_map { |child| required_paths.call(child, data, path) }
  end
  if schema.key?('anyOf')
    branch = schema.fetch('anyOf').find { |child| schema_for.call(child).valid?(data) }
    next branch ? required_paths.call(branch, data, path) : []
  end
  found = []
  if data.is_a?(Hash)
    found.concat(schema.fetch('required', []).map { |key| path + [key] })
    schema.fetch('properties', {}).each do |key, child|
      found.concat(required_paths.call(child, data[key], path + [key])) if data.key?(key)
    end
  elsif data.is_a?(Array) && schema.key?('items')
    data.each_with_index { |value, index| found.concat(required_paths.call(schema.fetch('items'), value, path + [index])) }
  end
  found
end

# The final Pages adapter changes discovery only after producer validation.
# Validate the actual transformed catalogue, including its local file targets.
if ARGV[0]
  catalogue_path = File.expand_path(ARGV.fetch(0))
  catalogue = JSON.parse(File.read(catalogue_path))
  require_relative 'publication-catalogue'
  PublicationCatalogue.validate!(catalogue, spec, api_dir: File.dirname(catalogue_path))
  puts 'Final publication catalogue matches OpenAPI and every declared local target'
end

negative_count = 0
cases.each do |item|
  template = item.fetch('template')
  operation = spec.fetch('paths').fetch(template).fetch('get')
  parameters = item.fetch('parameters')
  assert.call(parameters.keys.sort == operation.fetch('parameters', []).map { |p| p.fetch('name') }.sort,
              "Fixture parameters do not match #{template}")
  operation.fetch('parameters', []).each do |parameter|
    assert.call(schema_for.call(parameter.fetch('schema')).valid?(parameters.fetch(parameter.fetch('name'))),
                "Fixture uses an excluded parameter for #{template}")
  end
  path = template.gsub(/\{([^}]+)\}/) { parameters.fetch(Regexp.last_match(1)) }
  assert.call(item.fetch('sourceUrl').end_with?(path), "Fixture URL disagrees with #{template}")
  assert.call(item.fetch('status') == 200, "Fixture was not HTTP 200: #{path}")
  response_schema = operation.fetch('responses').fetch('200').fetch('content').values.fetch(0).fetch('schema')
  validator = schema_for.call(response_schema)
  data = item.fetch('response')
  errors = validator.validate(data).map { |error| error.slice('data_pointer', 'type', 'error') }
  assert.call(errors.empty?, "#{path}: #{errors.first(3).to_json}")
  assert.call(!validator.valid?(42), "Wrong response type was accepted for #{path}")
  negative_count += 1
  required_paths.call(response_schema, data).uniq.each do |field_path|
    missing = Marshal.load(Marshal.dump(data))
    parent = field_path[0...-1].reduce(missing) { |value, key| value.fetch(key) }
    parent.delete(field_path.last)
    assert.call(!validator.valid?(missing), "Missing #{field_path.inspect} accepted for #{path}")
    wrong = Marshal.load(Marshal.dump(data))
    parent = field_path[0...-1].reduce(wrong) { |value, key| value.fetch(key) }
    parent[field_path.last] = parent.fetch(field_path.last).is_a?(Numeric) ? 'wrong-type' : 42
    assert.call(!validator.valid?(wrong), "Wrong type #{field_path.inspect} accepted for #{path}")
    negative_count += 2
  end
end

# The four independently reproduced failures remain explicit, load-bearing
# regressions even if other cases or enum declarations change later.
%w[/by-type/person.jsonld /by-list/index.jsonld /by-organization/ch/eda.jsonld /by-document-type/ch/act.jsonld].each do |path|
  assert.call(cases.any? { |item| item.fetch('sourceUrl').end_with?(path) }, "Missing counterexample #{path}")
end
# Optional localized title fields still have a contract: language-tag maps
# carry strings, not arbitrary values. The real nonempty source fixture tests
# both these summary fields and the required entryCount/@id inside each item.
summary_case = cases.find { |item| item.fetch('sourceUrl').end_with?('/by-document-type/cn/state-council-order.jsonld') }
wrong = Marshal.load(Marshal.dump(summary_case.fetch('response')))
wrong.fetch('legalInstruments').fetch(0)['title'] = [{ 'en' => 42 }]
operation = spec.fetch('paths').fetch(summary_case.fetch('template')).fetch('get')
schema = operation.fetch('responses').fetch('200').fetch('content').values.fetch(0).fetch('schema')
assert.call(!schema_for.call(schema).valid?(wrong), 'Numeric localized title was accepted')
negative_count += 1

puts "API contract: #{cases.length} actual response excerpts, #{spec.fetch('paths').length} routes, #{negative_count} malformed-response rejections"
