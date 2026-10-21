# frozen_string_literal: true

require 'json_schemer'

module PublicationCatalogue
  ASSETS = {
    'all.jsonld' => ['all.jsonld', 'application/ld+json'],
    'all.ttl' => ['all.ttl', 'text/turtle'],
    'sources/ru.ttl' => ['ru.ttl', 'text/turtle']
  }.freeze

  def self.validate!(catalogue, spec, api_dir: nil)
    schema = spec.fetch('components').fetch('schemas').fetch('Catalogue')
    validator = JSONSchemer.schema(schema.merge('$schema' => 'https://json-schema.org/draft/2020-12/schema', 'components' => spec.fetch('components')))
    raise "Catalogue violates OpenAPI: #{validator.validate(catalogue).to_a.first(3)}" unless validator.valid?(catalogue)

    local_path = lambda do |relative|
      target = File.expand_path(relative, api_dir)
      raise "Catalogue path escapes API directory: #{relative}" unless target.start_with?(api_dir + '/')
      target
    end
    catalogue.fetch('entries').each do |entry|
      if entry.fetch('url').match?(%r{\A[a-z][a-z0-9+.-]*://}i)
        asset = ASSETS[entry.fetch('name')]
        raise 'Unknown external catalogue entry' unless asset
        filename, media_type = asset
        release = catalogue.fetch('bulkRelease')
        tag = release.fetch('tag')
        commit = tag.delete_prefix('api-v1-')
        expected_url = "https://github.com/ammitto/data/releases/download/#{tag}/#{filename}"
        unless entry.fetch('url') == expected_url && entry.fetch('mediaType') == media_type &&
               entry.fetch('bytes').positive? && entry.fetch('releaseTag') == tag &&
               entry.fetch('sourceCommit') == commit && entry.fetch('published') == release.fetch('published') &&
               release.fetch('url') == "https://github.com/ammitto/data/releases/tag/#{tag}"
          raise 'External asset name, format, size or release provenance disagrees'
        end
        next
      end
      next unless api_dir

      target = local_path.call(entry.fetch('url'))
      raise "Catalogue target absent: #{target}" unless File.exist?(target)
      if entry.key?('bytes')
        raise "Catalogue bytes disagree: #{target}" unless File.file?(target) && File.size(target) == entry.fetch('bytes')
      end
      entry.fetch('members', []).each do |member|
        raise "Catalogue member absent: #{member}" unless File.file?(local_path.call(File.join(entry.fetch('url'), member)))
      end
      entry.fetch('collections', []).each do |collection|
        raise "Catalogue collection absent: #{collection}" unless File.directory?(local_path.call(File.join(entry.fetch('url'), collection)))
      end
      if entry.key?('index') && !File.file?(local_path.call(entry.fetch('index')))
        raise "Catalogue index absent: #{entry['index']}"
      end
    end
    true
  end
end
