#!/usr/bin/env node

/**
 * Build script to copy pre-generated API data from data-cn to public directory.
 *
 * The Ruby harmonization process generates all API files in data-cn/api/.
 * This script copies them to the Vite public directory for serving.
 *
 * Usage: node scripts/build-api-data.js
 *
 * Environment variables:
 *   SKIP_API_DATA      - when set (and not "0"/"false"), skip entirely and
 *                        leave public/api/v1 untouched. CI sets this because
 *                        the harmonize step has already populated the
 *                        directory with fresh multi-source data.
 *   AMMITTO_DATA_CN_DIR - explicit path to the data-cn checkout (repo root,
 *                        containing api/v1). Overrides auto-detection.
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
 * Locate the data-cn api/v1 tree. Candidates, in priority order:
 *   1. $AMMITTO_DATA_CN_DIR/api/v1 (explicit override)
 *   2. <repo>/data-cn/api/v1       (CI layout: data repos are cloned into
 *                                   the workspace, inside the website checkout)
 *   3. <repo>/../data-cn/api/v1    (legacy local layout: data repos are
 *                                   siblings of the website checkout)
 * Returns the first candidate that exists, or null.
 */
function resolveDataCnApiDir() {
  const candidates = [];
  if (process.env.AMMITTO_DATA_CN_DIR) {
    candidates.push(path.join(process.env.AMMITTO_DATA_CN_DIR, 'api/v1'));
  }
  candidates.push(path.resolve(__dirname, '../data-cn/api/v1'));
  candidates.push(path.resolve(__dirname, '../../data-cn/api/v1'));

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
 * Main build function
 */
function build() {
  const skip = process.env.SKIP_API_DATA;
  if (skip && skip !== '0' && skip !== 'false') {
    console.log('SKIP_API_DATA is set: skipping API data copy, leaving existing public/api/v1 in place.');
    return;
  }

  console.log('Copying API data from data-cn to public directory...\n');

  const dataCnApiDir = resolveDataCnApiDir();
  if (!dataCnApiDir) {
    console.log('Skipping API data copy: no data-cn source available; using existing public/api/v1 content.');
    return;
  }

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
