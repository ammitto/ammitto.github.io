#!/usr/bin/env node

/**
 * Generate individual node files from JSON-LD source files
 *
 * This script reads the source JSON-LD files and creates individual
 * node files with sanitized filenames for both entities and entries.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_DIR = path.resolve(__dirname, '../public/api/v1');
const SOURCES_DIR = path.join(API_DIR, 'sources');
const NODE_DIR = path.join(API_DIR, 'node');

/**
 * Sanitize a string for use as filename
 */
function sanitize(str) {
  if (!str || str.trim() === '') return 'unknown';

  return str.toString()
    .replace(/\s+/g, '-')           // Replace whitespace with hyphens
    .replace(/[^a-zA-Z0-9\-_]/g, '') // Remove non-alphanumeric/hyphen/underscore
    .replace(/--+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '')          // Remove leading/trailing hyphens
    .toLowerCase()
    .slice(0, 64);
}

/**
 * Extract source and local_id from entity IRI
 */
function parseEntityIri(iri) {
  const match = iri.match(/\/entity\/([^/]+)\/(.+)$/);
  if (match) {
    return { source: match[1], localId: match[2] };
  }
  return null;
}

/**
 * Extract source, list_type, and local_id from entry IRI
 */
function parseEntryIri(iri) {
  const match = iri.match(/\/entry\/([^/]+)\/([^/]+)\/(.+)$/);
  if (match) {
    return { source: match[1], listType: match[2], localId: match[3] };
  }
  return null;
}

/**
 * Process a source JSON-LD file and generate node files
 */
function processSourceFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(content);

  // Keep the underscore source code as-is: entity/entry IRIs use underscore
  // codes (e.g. entity/eu_vessels/...), and the frontend fetches node files
  // at api/v1/node/entity/<ref>.jsonld with refs extracted from those IRIs.
  const sourceCode = path.basename(filePath, '.jsonld');

  // Create directories
  const nodeEntityDir = path.join(NODE_DIR, 'entity', sourceCode);
  const nodeEntryDir = path.join(NODE_DIR, 'entry', sourceCode);
  fs.mkdirSync(nodeEntityDir, { recursive: true });
  fs.mkdirSync(nodeEntryDir, { recursive: true });

  const graph = data['@graph'] || data.graph || [];
  let entityCount = 0;
  let entryCount = 0;

  for (const node of graph) {
    const iri = node.id || node['@id'] || '';

    // Process entities
    if (iri.includes('/entity/')) {
      const parsed = parseEntityIri(iri);
      if (parsed) {
        const sanitizedId = sanitize(parsed.localId);
        const nodeFile = path.join(nodeEntityDir, `${sanitizedId}.jsonld`);

        const nodeData = {
          ...node,
          '@context': 'https://www.ammitto.org/ontology/context.jsonld'
        };

        fs.writeFileSync(nodeFile, JSON.stringify(nodeData, null, 2));
        entityCount++;
      }
    }

    // Process entries
    if (iri.includes('/entry/')) {
      const parsed = parseEntryIri(iri);
      if (parsed) {
        // Create list-type specific directory
        const entryDir = path.join(nodeEntryDir, parsed.listType);
        fs.mkdirSync(entryDir, { recursive: true });

        const sanitizedId = sanitize(parsed.localId);
        const nodeFile = path.join(entryDir, `${sanitizedId}.jsonld`);

        const nodeData = {
          ...node,
          '@context': 'https://www.ammitto.org/ontology/context.jsonld'
        };

        fs.writeFileSync(nodeFile, JSON.stringify(nodeData, null, 2));
        entryCount++;
      }
    }
  }

  return { entityCount, entryCount };
}

/**
 * Main function
 */
function main() {
  console.log('Generating node files from JSON-LD sources...\n');

  // Ensure node directories exist
  fs.mkdirSync(path.join(NODE_DIR, 'entity'), { recursive: true });
  fs.mkdirSync(path.join(NODE_DIR, 'entry'), { recursive: true });

  // Get all source files
  const sourceFiles = fs.readdirSync(SOURCES_DIR)
    .filter(f => f.endsWith('.jsonld'))
    .map(f => path.join(SOURCES_DIR, f));

  console.log(`Found ${sourceFiles.length} source files:\n`);

  let totalEntities = 0;
  let totalEntries = 0;

  for (const file of sourceFiles) {
    const sourceCode = path.basename(file, '.jsonld');
    try {
      const { entityCount, entryCount } = processSourceFile(file);
      console.log(`  ${sourceCode}: ${entityCount} entities, ${entryCount} entries`);
      totalEntities += entityCount;
      totalEntries += entryCount;
    } catch (err) {
      console.error(`  ${sourceCode}: ERROR - ${err.message}`);
    }
  }

  console.log(`\nTotal: ${totalEntities} entities, ${totalEntries} entries`);
  console.log('\nDone!');
}

main();
