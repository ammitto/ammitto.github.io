#!/usr/bin/env node

/**
 * Build script to convert harmonized YAML data to JSON-LD format
 * for the Ammitto frontend.
 *
 * Usage: node scripts/build-api-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DATA_DIR = path.resolve(__dirname, '../../data');
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const API_DIR = path.join(PUBLIC_DIR, 'api/v1');

// Source mappings
const SOURCES = {
  eu: {
    file: 'eu_sanctions_list.yaml',
    code: 'eu',
    name: 'European Union'
  },
  un: {
    file: 'un_sanctions_list.yaml',
    code: 'un',
    name: 'United Nations'
  },
  us: {
    file: 'us_govt_sanctions_list.yaml',
    code: 'us',
    name: 'United States'
  },
  wb: {
    file: 'world_bank_sanctions_list.yaml',
    code: 'wb',
    name: 'World Bank'
  }
};

/**
 * Convert entity type to JSON-LD @type
 */
function getEntityType(entityType) {
  const typeMap = {
    person: 'PersonEntity',
    organization: 'OrganizationEntity',
    vessel: 'VesselEntity',
    aircraft: 'AircraftEntity',
    entity: 'OrganizationEntity',
    individual: 'PersonEntity',
  };
  return typeMap[entityType?.toLowerCase()] || 'OrganizationEntity';
}

/**
 * Normalize entity type
 */
function normalizeEntityType(entityType) {
  const typeMap = {
    person: 'person',
    organization: 'organization',
    vessel: 'vessel',
    aircraft: 'aircraft',
    entity: 'organization',
    individual: 'person',
  };
  return typeMap[entityType?.toLowerCase()] || 'organization';
}

/**
 * Convert YAML entity to JSON-LD format
 */
function convertEntity(entity, index, sourceCode) {
  const names = Array.isArray(entity.names)
    ? entity.names.map((name, i) => ({
        fullName: typeof name === 'string' ? name : name.fullName || name,
        isPrimary: i === 0
      }))
    : [{ fullName: entity.names || 'Unknown', isPrimary: true }];

  const jsonld = {
    '@id': `${sourceCode}-entity-${String(index).padStart(5, '0')}`,
    '@type': getEntityType(entity.entity_type),
    entityType: normalizeEntityType(entity.entity_type),
    names
  };

  // Source reference
  if (entity.ref_number) {
    jsonld.sourceReferences = [{
      sourceCode: sourceCode,
      referenceNumber: entity.ref_number
    }];
  }

  // Birth info
  if (entity.birthdate || entity.country) {
    jsonld.birthInfo = [{
      date: entity.birthdate,
      country: entity.country
    }];
  }

  // Addresses
  if (entity.address && Array.isArray(entity.address)) {
    jsonld.addresses = entity.address.map(addr => ({
      street: addr.street,
      city: addr.city,
      state: addr.state,
      country: addr.country || entity.country,
      postalCode: addr.zip
    }));
  }

  // Remarks
  if (entity.remark) {
    jsonld.remarks = entity.remark;
  }

  // Contact
  if (entity.contact) {
    jsonld.contact = entity.contact;
  }

  return jsonld;
}

/**
 * Process a source file and generate JSON-LD
 */
function processSource(sourceKey) {
  const source = SOURCES[sourceKey];
  const filePath = path.join(DATA_DIR, 'processed', source.file);

  if (!fs.existsSync(filePath)) {
    console.log(`  Skipping ${sourceKey}: file not found`);
    return null;
  }

  console.log(`  Processing ${source.name}...`);

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = yaml.parse(content, {
      strict: false,
      prettyErrors: false
    });

    if (!Array.isArray(data)) {
      console.log(`  Skipping ${sourceKey}: invalid format`);
      return null;
    }

    // Convert entities
    const entities = data
      .map((entity, index) => convertEntity(entity, index, source.code))
      .filter(e => e);

    // Count by entity type
    const typeCounts = {};
    entities.forEach(e => {
      typeCounts[e.entityType] = (typeCounts[e.entityType] || 0) + 1;
    });

    // Create JSON-LD output
    const jsonld = {
      '@context': '/schemas/context.jsonld',
      '@graph': entities
    };

    // Write output
    const outputPath = path.join(API_DIR, 'sources', `${source.code}.jsonld`);
    fs.writeFileSync(outputPath, JSON.stringify(jsonld, null, 2));
    console.log(`    Wrote ${entities.length} entities to ${outputPath}`);

    return {
      code: source.code,
      name: source.name,
      entities: entities.length,
      typeCounts
    };
  } catch (error) {
    console.log(`  Error processing ${sourceKey}: ${error.message}`);
    return null;
  }
}

/**
 * Main build function
 */
function build() {
  console.log('Building API data from harmonized YAML...\n');

  // Ensure directories exist
  fs.mkdirSync(path.join(API_DIR, 'sources'), { recursive: true });
  fs.mkdirSync(path.join(PUBLIC_DIR, 'schemas'), { recursive: true });

  // Copy ontology
  const ontologySrc = path.join(DATA_DIR, 'ontology', 'context.jsonld');
  const ontologyDest = path.join(PUBLIC_DIR, 'schemas', 'context.jsonld');
  if (fs.existsSync(ontologySrc)) {
    fs.copyFileSync(ontologySrc, ontologyDest);
    console.log('Copied ontology to public/schemas/\n');
  }

  // Process each source
  const stats = {
    exported_at: new Date().toISOString(),
    sources: {},
    totals: {
      entities: 0,
      entries: 0
    },
    entityTypes: {
      person: 0,
      organization: 0,
      vessel: 0,
      aircraft: 0
    }
  };

  Object.keys(SOURCES).forEach(sourceKey => {
    const result = processSource(sourceKey);
    if (result) {
      stats.sources[result.code] = {
        entities: result.entities,
        entries: result.entities
      };
      stats.totals.entities += result.entities;
      stats.totals.entries += result.entities;

      // Aggregate type counts
      Object.entries(result.typeCounts).forEach(([type, count]) => {
        stats.entityTypes[type] = (stats.entityTypes[type] || 0) + count;
      });
    }
  });

  // Write stats
  const statsPath = path.join(API_DIR, 'stats.json');
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log(`\nWrote stats to ${statsPath}`);

  console.log('\nBuild complete!');
  console.log(`Total entities: ${stats.totals.entities}`);
  console.log('Entity types:', stats.entityTypes);
}

// Run build
build();
