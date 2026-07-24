#!/usr/bin/env node

/**
 * Build script to copy pre-generated API data from data-cn to public directory.
 *
 * The Ruby harmonization process generates all API files in data-cn/api/v1/.
 * This script copies them to the Vite public directory for serving.
 *
 * Usage: node scripts/build-api-data.js
 *
 * Environment variables:
 *   SKIP_API_DATA      - when set (and not "0"/"false"), skip the copy and
 *                        leave public/api/v1 in place. CI sets this because
 *                        the harmonize step has already populated the
 *                        directory with fresh multi-source data. Fails if
 *                        public/api/v1 is missing or empty.
 *   AMMITTO_DATA_CN_DIR - explicit path to the data-cn checkout (repo root,
 *                        containing api/v1). Replaces auto-detection; fails
 *                        if the tree is missing rather than falling back.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PUBLIC_API_DIR = path.join(PUBLIC_DIR, 'api/v1');

/**
 * Locate the data-cn api/v1 tree.
 *
 * When $AMMITTO_DATA_CN_DIR is set it is the only candidate: a missing tree
 * there is a configuration error, not a reason to fall back to other data.
 * Otherwise, auto-detect:
 *   1. <repo>/data-cn/api/v1     (CI layout: data repos are cloned into
 *                                 the workspace, inside the website checkout)
 *   2. <repo>/../data-cn/api/v1  (legacy local layout: data repos are
 *                                 siblings of the website checkout)
 * Returns the first candidate that exists, or null.
 */
function resolveDataCnApiDir() {
  if ('AMMITTO_DATA_CN_DIR' in process.env) {
    if (!process.env.AMMITTO_DATA_CN_DIR) {
      console.error('ERROR: AMMITTO_DATA_CN_DIR is set but empty.');
      process.exit(1);
    }
    const override = path.join(process.env.AMMITTO_DATA_CN_DIR, 'api/v1');
    if (!fs.existsSync(override)) {
      console.error(`ERROR: AMMITTO_DATA_CN_DIR is set but ${override} does not exist.`);
      process.exit(1);
    }
    return override;
  }

  const candidates = [
    path.resolve(__dirname, '../data-cn/api/v1'),
    path.resolve(__dirname, '../../data-cn/api/v1'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  console.log('No data-cn API directory found. Checked:');
  for (const candidate of candidates) {
    console.log(`  - ${candidate}`);
  }
  return null;
}

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Count files in directory recursively
 */
function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(fullPath);
    } else if (entry.isFile()) {
      count++;
    }
  }

  return count;
}

/**
 * Guard for the skip paths: the build is about to proceed without copying
 * API data, so the existing public/api/v1 tree must actually be usable.
 */
function requireExistingApiData(reason) {
  if (!fs.existsSync(PUBLIC_API_DIR) || countFiles(PUBLIC_API_DIR) === 0) {
    console.error(`ERROR: ${reason}, but ${PUBLIC_API_DIR} is missing or empty.`);
    console.error('The site would build without API data.');
    process.exit(1);
  }
}

/**
 * Main build function
 */
function build() {
  const skip = process.env.SKIP_API_DATA;
  if (skip && skip !== '0' && skip !== 'false') {
    requireExistingApiData('SKIP_API_DATA is set');
    console.log('SKIP_API_DATA is set: skipping API data copy, leaving existing public/api/v1 in place.');
    return;
  }

  const dataCnApiDir = resolveDataCnApiDir();
  if (!dataCnApiDir) {
    requireExistingApiData('no data-cn source available');
    console.log('Skipping API data copy: no data-cn source available; using existing public/api/v1 content.');
    return;
  }

  // Validate the source before deleting the destination: an empty or
  // partial data-cn tree must not replace existing content.
  if (!fs.existsSync(path.join(dataCnApiDir, 'search-index.json'))) {
    console.error(`ERROR: ${dataCnApiDir} has no search-index.json; refusing to replace ${PUBLIC_API_DIR} with a partial API tree.`);
    process.exit(1);
  }

  console.log('Copying API data from data-cn to public directory...\n');

  // Clean destination
  if (fs.existsSync(PUBLIC_API_DIR)) {
    fs.rmSync(PUBLIC_API_DIR, { recursive: true });
  }

  // Copy all files
  console.log(`Source: ${dataCnApiDir}`);
  console.log(`Destination: ${PUBLIC_API_DIR}\n`);

  copyDir(dataCnApiDir, PUBLIC_API_DIR);

  // Report stats
  const fileCount = countFiles(PUBLIC_API_DIR);

  // Read search index to get entity count
  const searchIndexPath = path.join(PUBLIC_API_DIR, 'search-index.json');
  let entityCount = 0;
  if (fs.existsSync(searchIndexPath)) {
    const searchIndex = JSON.parse(fs.readFileSync(searchIndexPath, 'utf8'));
    entityCount = searchIndex.metadata?.totalEntities || searchIndex.entities?.length || 0;
  }

  console.log(`Copied ${fileCount} files`);
  console.log(`Total entities: ${entityCount}`);
  console.log('\nBuild complete!');
}

// Run build
build();
