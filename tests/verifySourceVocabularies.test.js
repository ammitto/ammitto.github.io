/**
 * The gate that would have caught five sources' vocabularies going missing.
 *
 * deploy.yml checked node/document-type/index.jsonld and
 * node/organization/index.jsonld with `test -s`. The gem loaded only the
 * first requested source's sources/supporting/ directory, so the published
 * graph held uk's six document types and five organizations and nothing from
 * ch, cn, jp, ru or us — and a uk-only index is non-empty, so the gate went
 * green through every day of it.
 *
 * These tests are the red proof. The first fixture is the shape of the real
 * output; the rest are the losses the old gate could not see, each asserted
 * to fail with the missing SOURCE named, because "a count moved" is not
 * something anyone can act on at 3am.
 *
 * Plain JavaScript against the script itself — it is plain JavaScript too, so
 * unlike the src/utils modules it needs no tsc emit step first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BASE_URI,
  declaredIds,
  publishedIds,
  repoDirFor,
  verifySourceVocabularies,
} from '../scripts/verify-source-vocabularies.js';

/**
 * LIVE — https://ammitto.org/api/v1/node/{document-type,organization}/index.jsonld
 * and the sources/supporting/ files of all fifteen ammitto/data-* repositories,
 * read 2026-08-13. Exactly six repositories ship a vocabulary; the other nine
 * answer 404 for both files. Published counts matched declared counts exactly,
 * in both directions, for all six.
 */
const REAL = {
  ch: { 'document-type': 4, organization: 4 },
  cn: { 'document-type': 7, organization: 8 },
  jp: { 'document-type': 10, organization: 11 },
  ru: { 'document-type': 2, organization: 2 },
  uk: { 'document-type': 6, organization: 5 },
  us: { 'document-type': 6, organization: 7 },
};
/** The full harmonize list, so the nine sources shipping nothing are exercised too. */
const ALL_SOURCES = [
  'eu', 'un', 'wb', 'uk', 'au', 'ca', 'cn', 'ru', 'tr',
  'nz', 'jp', 'eu_vessels', 'un_vessels', 'us', 'ch',
];

const YAML_KEY = { 'document-type': 'document_types', organization: 'organizations' };
const YAML_FILE = { 'document-type': 'document-types.yml', organization: 'organizations.yml' };

let counter = 0;

/**
 * Build a workspace shaped like the deploy runner's: data-* clones beside a
 * harmonized public/api/v1. `omit` drops identifiers from the published side
 * only, which is precisely what a vocabulary that never loaded looks like.
 */
function buildWorkspace({ omitFromIndex = {}, omitNodeFiles = {}, omitClones = [] } = {}) {
  counter += 1;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ammitto-vocab-${counter}-`));
  const apiDir = path.join(root, 'public', 'api', 'v1');
  const published = { 'document-type': [], organization: [] };

  // Every source is cloned on the runner, whether or not it ships a
  // vocabulary; the nine that ship none must be silently fine.
  for (const source of ALL_SOURCES) {
    if (omitClones.includes(source)) continue;
    fs.mkdirSync(path.join(root, repoDirFor(source)), { recursive: true });
  }

  for (const [source, kinds] of Object.entries(REAL)) {
    for (const [kind, count] of Object.entries(kinds)) {
      const ids = Array.from({ length: count }, (_, i) => `${source}/${kind}-${i + 1}`);

      if (!omitClones.includes(source)) {
        const dir = path.join(root, repoDirFor(source), 'sources', 'supporting');
        fs.mkdirSync(dir, { recursive: true });
        const rows = ids.map((id) => `  - id: ${id}\n    name:\n      en: ${id}\n`).join('');
        fs.writeFileSync(path.join(dir, YAML_FILE[kind]), `${YAML_KEY[kind]}:\n${rows}`);
      }

      const dropped = new Set(omitFromIndex[source]?.[kind] ?? []);
      const fileless = new Set(omitNodeFiles[source]?.[kind] ?? []);
      for (const id of ids) {
        if (dropped.has(id)) continue;
        published[kind].push(id);
        if (fileless.has(id)) continue;
        const nodePath = path.join(apiDir, 'node', kind, `${id}.jsonld`);
        fs.mkdirSync(path.dirname(nodePath), { recursive: true });
        fs.writeFileSync(nodePath, JSON.stringify({ '@id': `${BASE_URI}/${kind}/${id}` }));
      }
    }
  }

  for (const kind of Object.keys(published)) {
    const indexPath = path.join(apiDir, 'node', kind, 'index.jsonld');
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, JSON.stringify({
      '@context': 'https://ammitto.org/api/v1/context.jsonld',
      '@type': 'Index',
      nodes: published[kind].sort().map((id) => ({ '@id': `${BASE_URI}/${kind}/${id}` })),
    }));
  }

  return { root, apiDir };
}

const run = (workspace, sources = ALL_SOURCES) =>
  verifySourceVocabularies({ sourcesRoot: workspace.root, apiDir: workspace.apiDir, sources });

test('passes on output where every declared vocabulary reached the graph', () => {
  const { failures, expectations } = run(buildWorkspace());
  assert.deepEqual(failures, []);
  // Six repositories, two vocabularies each.
  assert.equal(expectations.length, 12);
});

test('fails, naming the source, when one source contributes no vocabulary at all', () => {
  // The real defect: uk loaded, jp did not.
  const workspace = buildWorkspace({
    omitFromIndex: {
      jp: {
        'document-type': Array.from({ length: 10 }, (_, i) => `jp/document-type-${i + 1}`),
        organization: Array.from({ length: 11 }, (_, i) => `jp/organization-${i + 1}`),
      },
    },
  });
  const { failures } = run(workspace);
  assert.equal(failures.length, 2);
  for (const failure of failures) {
    assert.match(failure, /^Source jp: /);
    assert.match(failure, /contributed NO .* vocabulary to the graph at all/);
  }
  assert.match(failures[0], /10 of 10 document-types/);
  assert.match(failures[1], /11 of 11 organizations/);
  // No other source is blamed for jp's loss.
  assert.equal(failures.filter((f) => /^Source (?!jp:)/.test(f)).length, 0);
});

test('fails once per missing source when the whole non-first supplement set is lost', () => {
  // The published state as it actually stood: uk only.
  const omitFromIndex = {};
  for (const [source, kinds] of Object.entries(REAL)) {
    if (source === 'uk') continue;
    omitFromIndex[source] = {};
    for (const [kind, count] of Object.entries(kinds)) {
      omitFromIndex[source][kind] = Array.from({ length: count }, (_, i) => `${source}/${kind}-${i + 1}`);
    }
  }
  const { failures } = run(buildWorkspace({ omitFromIndex }));
  const named = failures.map((f) => f.match(/^Source (\w+):/)[1]);
  assert.deepEqual([...new Set(named)].sort(), ['ch', 'cn', 'jp', 'ru', 'us']);
  assert.equal(failures.length, 10);
});

test('fails on partial loss and says so rather than calling the source dark', () => {
  const workspace = buildWorkspace({
    omitFromIndex: { us: { organization: ['us/organization-2', 'us/organization-5'] } },
  });
  const { failures } = run(workspace);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^Source us: 2 of 7 organizations/);
  assert.match(failures[0], /us\/organization-2, us\/organization-5/);
  assert.match(failures[0], /loaded only in part/);
  assert.doesNotMatch(failures[0], /at all/);
});

test('fails when an index entry has no node file behind it', () => {
  // The pair of 404s /organization/cn/state-council and
  // /document-type/cn/ministry-of-commerce-order used to produce.
  const workspace = buildWorkspace({
    omitNodeFiles: { cn: { organization: ['cn/organization-3'] } },
  });
  const { failures } = run(workspace);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^Source cn: 1 of 8 organizations are listed in/);
  assert.match(failures[0], /no node file behind them/);
  assert.match(failures[0], /404/);
});

test('fails closed when a data repository is not present to be read', () => {
  const { failures } = run(buildWorkspace({ omitClones: ['ru'] }));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^Source ru: /);
  assert.match(failures[0], /cannot be established/);
});

test('fails closed rather than passing when it finds nothing to assert', () => {
  // Sources cloned and shipping no vocabulary: an empty expectation set is a
  // gate pointed at the wrong tree, not a green result.
  const { failures } = run(buildWorkspace(), ['au', 'tr']);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /found nothing to assert/);
});

test('ignores sources that ship no vocabulary when others do', () => {
  const { failures, expectations } = run(buildWorkspace(), ['uk', 'au', 'tr', 'wb']);
  assert.deepEqual(failures, []);
  assert.deepEqual(expectations.map((e) => `${e.source}/${e.kind}`),
    ['uk/document-type', 'uk/organization']);
});

test('fails when a supporting file exists but declares nothing', () => {
  const workspace = buildWorkspace();
  fs.writeFileSync(
    path.join(workspace.root, 'data-ch', 'sources', 'supporting', 'document-types.yml'),
    'document_types: []\n',
  );
  const { failures } = run(workspace);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^Source ch: /);
  assert.match(failures[0], /declares no document-type/);
});

test('fails when a supporting file cannot be parsed, as the loader drops it silently', () => {
  const workspace = buildWorkspace();
  fs.writeFileSync(
    path.join(workspace.root, 'data-cn', 'sources', 'supporting', 'organizations.yml'),
    'organizations:\n  - id: cn/x\n   name: "unclosed\n\t\tbad: [\n',
  );
  const { failures } = run(workspace);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^Source cn: /);
  assert.match(failures[0], /could not be parsed/);
});

test('fails when the index itself is unreadable rather than throwing', () => {
  const workspace = buildWorkspace();
  fs.writeFileSync(path.join(workspace.apiDir, 'node', 'organization', 'index.jsonld'), '');
  const { failures } = run(workspace);
  assert.ok(failures.some((f) => /index\.jsonld: /.test(f) && /not valid JSON/.test(f)));
});

test('repoDirFor hyphenates the underscored vessel codes', () => {
  assert.equal(repoDirFor('eu_vessels'), 'data-eu-vessels');
  assert.equal(repoDirFor('un_vessels'), 'data-un-vessels');
  assert.equal(repoDirFor('uk'), 'data-uk');
});

test('declaredIds mirrors the loader: rows without a usable id are not declared', () => {
  const yaml = [
    'document_types:',
    '  - id: uk/act',
    '  - name: no id here',
    '  - id: ""',
    '  - id: uk/order',
  ].join('\n');
  assert.deepEqual(declaredIds(yaml, 'document_types'), ['uk/act', 'uk/order']);
  assert.deepEqual(declaredIds('other_key: []', 'document_types'), []);
});

test('publishedIds strips the base IRI the browse pages strip', () => {
  const index = JSON.stringify({
    nodes: [
      { '@id': `${BASE_URI}/organization/uk/ofsi` },
      { '@id': 'https://example.invalid/organization/uk/ofsi' },
    ],
  });
  assert.deepEqual(publishedIds(index, 'organization'), ['uk/ofsi']);
  assert.throws(() => publishedIds('{}', 'organization'), /no nodes array/);
  assert.throws(() => publishedIds('[]', 'organization'), /not a JSON object/);
  assert.throws(() => publishedIds('{"nodes":[{}]}', 'organization'), /no string @id/);
});
