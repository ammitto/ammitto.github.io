#!/usr/bin/env node

/**
 * Generate search-index.json from JSON-LD source files
 *
 * This script reads the source JSON-LD files and creates a lightweight
 * search index with sanitized IRIs for the website.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_DIR = path.resolve(__dirname, '../public/api/v1');
const SOURCES_DIR = path.join(API_DIR, 'sources');

/**
 * Sanitize a string for use as URL-safe identifier
 */
function sanitize(str) {
  if (!str || str.trim() === '') return 'unknown';

  return str.toString()
    .replace(/\s+/g, '-')           // Replace whitespace with hyphens
    .replace(/[^a-zA-Z0-9\-_]/g, '') // Remove non-alphanumeric/hyphen/underscore
    .replace(/--+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')          // Remove leading/trailing hyphens
    .toLowerCase()
    .slice(0, 64);                  // Truncate
}

/**
 * Extract ref from IRI
 * "https://www.ammitto.org/entity/cn/mitsubishi-heavy-industries" -> "cn/mitsubishi-heavy-industries"
 */
function extractRef(iri) {
  if (!iri) return null;

  // Match entity IRIs
  const entityMatch = iri.match(/\/entity\/([^/]+\/[^/]+)$/);
  if (entityMatch) return entityMatch[1];

  // Match entry IRIs
  const entryMatch = iri.match(/\/entry\/([^/]+\/[^/]+\/[^/]+)$/);
  if (entryMatch) return entryMatch[1];

  return null;
}

/**
 * Extract authority from IRI or source field
 */
function extractAuthority(entity) {
  // From source_references
  if (entity.source_references?.[0]?.source_code) {
    return entity.source_references[0].source_code;
  }

  // From IRI
  const iri = entity.id || entity['@id'] || '';
  const match = iri.match(/\/entity\/([^/]+)\//);
  if (match) return match[1];

  return null;
}

/**
 * Extract primary name from entity
 */
function extractPrimaryName(entity) {
  const names = entity.names || [];

  // Find primary name
  const primary = names.find(n => n.is_primary || n.isPrimary);
  if (primary) {
    return primary.full_name || primary.fullName || primary.name;
  }

  // Fall back to first name
  if (names[0]) {
    return names[0].full_name || names[0].fullName || names[0].name;
  }

  return 'Unknown';
}

/**
 * Extract all names from entity
 */
function extractNames(entity) {
  const names = entity.names || [];
  return names.map(n => n.full_name || n.fullName || n.name).filter(Boolean);
}

/**
 * Extract country from entity
 */
function extractCountry(entity) {
  // From nationalities
  if (entity.nationalities?.[0]) {
    const nat = entity.nationalities[0];
    if (typeof nat === 'string') return nat;
    return nat.country || nat.country_code;
  }

  // From addresses
  if (entity.addresses?.[0]?.country) {
    return entity.addresses[0].country;
  }

  // From birth_info
  if (entity.birth_info?.[0]?.country) {
    return entity.birth_info[0].country;
  }

  return null;
}

/**
 * Process a source JSON-LD file
 */
function processSourceFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);

  const entities = [];
  const graph = data['@graph'] || data.graph || [];

  for (const node of graph) {
    // Only process entities (not entries, announcements, etc.)
    const iri = node.id || node['@id'] || '';
    if (!iri.includes('/entity/')) continue;

    const ref = extractRef(iri);
    if (!ref) continue;

    const entity = {
      id: iri,
      ref: ref,
      type: node.entity_type || node.entityType || 'organization',
      names: extractNames(node),
      primaryName: extractPrimaryName(node),
      country: extractCountry(node),
      authority: extractAuthority(node),
      status: 'active',
    };

    // Remove null values
    Object.keys(entity).forEach(key => {
      if (entity[key] === null || entity[key] === undefined) {
        delete entity[key];
      }
    });

    entities.push(entity);
  }

  return entities;
}

/**
 * Get authority name from code
 */
function getAuthorityName(code) {
  const names = {
    'au': 'Australia',
    'ca': 'Canada',
    'ch': 'Switzerland',
    'cn': 'China',
    'eu': 'European Union',
    'eu_vessels': 'EU Vessels',
    'jp': 'Japan',
    'nz': 'New Zealand',
    'ru': 'Russia',
    'tr': 'Turkey',
    'uk': 'United Kingdom',
    'un': 'United Nations',
    'un_vessels': 'UN Vessels',
    'us': 'United States',
    'wb': 'World Bank'
  }
  return names[code] || code.toUpperCase()
}

/**
 * Main function
 */
function main() {
  console.log('Generating search index from JSON-LD sources...\n');

  const allEntities = [];
  const authorityCounts = {};

  // Get all source files
  const sourceFiles = fs.readdirSync(SOURCES_DIR)
    .filter(f => f.endsWith('.jsonld'))
    .map(f => path.join(SOURCES_DIR, f));

  console.log(`Found ${sourceFiles.length} source files:\n`);

  for (const file of sourceFiles) {
    const sourceCode = path.basename(file, '.jsonld');
    try {
      const entities = processSourceFile(file);
      console.log(`  ${sourceCode}: ${entities.length} entities`);

      // Count by authority
      entities.forEach(e => {
        const auth = e.authority || 'unknown';
        authorityCounts[auth] = (authorityCounts[auth] || 0) + 1;
      });

      allEntities.push(...entities);
    } catch (err) {
      console.error(`  ${sourceCode}: ERROR - ${err.message}`);
    }
  }

  console.log(`\nTotal entities: ${allEntities.length}`);

  // Build search index
  const searchIndex = {
    metadata: {
      generated: new Date().toISOString(),
      totalEntities: allEntities.length,
      sources: Object.keys(authorityCounts).length,
    },
    entities: allEntities,
  };

  // Write search index
  const outputPath = path.join(API_DIR, 'search-index.json');
  fs.writeFileSync(outputPath, JSON.stringify(searchIndex));
  console.log(`\nWrote search index to ${outputPath}`);

  // Write authority facets
  const facetsDir = path.join(API_DIR, 'facets');
  fs.mkdirSync(facetsDir, { recursive: true });

  const authorityFacets = Object.entries(authorityCounts)
    .map(([code, count]) => ({
      code,
      name: getAuthorityName(code),
      count,
    }))
    .sort((a, b) => b.count - a.count);

  fs.writeFileSync(
    path.join(facetsDir, 'authorities.json'),
    JSON.stringify({ facets: authorityFacets })
  );

  console.log('\nDone!');
}

main();
