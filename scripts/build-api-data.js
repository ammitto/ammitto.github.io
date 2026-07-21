#!/usr/bin/env node

/**
 * Build script to copy pre-generated API data from data-cn to public directory.
 *
 * The Ruby harmonization process generates all API files in data-cn/api/.
 * This script copies them to the Vite public directory for serving.
 *
 * Usage: node scripts/build-api-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DATA_CN_API_DIR = path.resolve(__dirname, '../../data-cn/api/v1');
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PUBLIC_API_DIR = path.join(PUBLIC_DIR, 'api/v1');

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
  console.log('Copying API data from data-cn to public directory...\n');

  // Check source exists
  if (!fs.existsSync(DATA_CN_API_DIR)) {
    console.error(`ERROR: Source directory not found: ${DATA_CN_API_DIR}`);
    console.error('Run "bundle exec rake regenerate" in data-cn first.');
    process.exit(1);
  }

  // Clean destination
  if (fs.existsSync(PUBLIC_API_DIR)) {
    fs.rmSync(PUBLIC_API_DIR, { recursive: true });
  }

  // Copy all files
  console.log(`Source: ${DATA_CN_API_DIR}`);
  console.log(`Destination: ${PUBLIC_API_DIR}\n`);

  copyDir(DATA_CN_API_DIR, PUBLIC_API_DIR);

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
