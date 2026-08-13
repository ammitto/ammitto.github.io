#!/usr/bin/env node

/**
 * Vocabulary reachability gate: every document type and organization a data
 * repository declares must reach the published graph.
 *
 * The gap this closes. deploy.yml's verify step checked
 * node/document-type/index.jsonld and node/organization/index.jsonld with
 * `test -s` — non-empty and nothing more. For weeks the gem loaded only the
 * FIRST requested source's sources/supporting/ directory and stopped, so the
 * published graph carried uk's six document types and five organizations and
 * nothing from ch, cn, jp, ru or us. A uk-only index satisfies `test -s`
 * perfectly, and every deploy went green while five sources' vocabularies were
 * absent. Entity floors could not see it either: vocabularies are loaded from
 * sources/supporting/, not from the entity corpus, so no entity count moves
 * when one disappears — ru publishes a vocabulary while harmonizing zero
 * entities, and us's 19k entities say nothing about whether its six document
 * types loaded.
 *
 * What is asserted, and why it cannot rot. The expectation is not a count and
 * not a list: it is derived per run from the inputs the workflow has already
 * cloned. A data repository that ships sources/supporting/document-types.yml
 * is declaring that those identifiers belong in the graph, so every one of
 * them must appear in the published index AND have the node file the site
 * fetches for it. Adding a document type passes (both sides grow), removing
 * one passes (nothing asserts it), a source that goes dark fails and is named.
 * A floor copied from today's snapshot would need a human to notice when a
 * repository starts or stops shipping a vocabulary; this needs no one.
 *
 * Two failure modes are distinguished because they break different things:
 * an identifier missing from the index makes /browse/document-types omit the
 * row entirely, while an identifier present in the index with no node file
 * makes the browse page issue a 404 for it — the exact pair of 404s that
 * /organization/cn/state-council and /document-type/cn/ministry-of-commerce-order
 * produced before the gem fix landed.
 *
 * Legal instruments are deliberately NOT covered by this rule even though
 * they load through the same first-match-only helper. Supporting data
 * materializes unconditionally (json_ld_graph_exporter.rb writes every
 * @document_types key into the index), but a legal instrument read from
 * sources/legal-instruments/ lands in a lookup table and becomes a node only
 * when a sanction entry cites it. data-jp and data-ru ship instrument files
 * that no entry cites, so "declared implies published" is false for
 * instruments by design and asserting it would cry wolf on the first run.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { parse as parseYaml } from 'yaml';

/**
 * Node IRI prefix the gem writes (json_ld_graph_exporter.rb BASE_URI) and the
 * site strips back off when it turns an index entry into a fetch path
 * (BrowseDocumentTypesPage.vue, BrowseOrganizationsPage.vue). Hardcoded here
 * for the same reason deploy.yml hardcodes it in its entity IRI check: a node
 * published under a different host is not a node this site can fetch.
 */
export const BASE_URI = 'https://www.ammitto.org';

/**
 * The two supplement files json_ld_graph_exporter.rb#load_supporting_data
 * opens by exact name, with the YAML key it reads out of each and the node
 * kind it publishes them under.
 */
export const VOCABULARIES = [
  {
    kind: 'document-type',
    file: 'document-types.yml',
    yamlKey: 'document_types',
  },
  {
    kind: 'organization',
    file: 'organizations.yml',
    yamlKey: 'organizations',
  },
];

/**
 * Source code to data repository directory name. The workflow clones
 * `data-<code>` with underscores hyphenated (data-eu-vessels for eu_vessels),
 * which is Config::Defaults::DATA_REPO_TO_SOURCE inverted.
 */
export function repoDirFor(source) {
  return `data-${source.replace(/_/g, '-')}`;
}

/**
 * Identifiers a supporting file declares, in file order.
 *
 * Takes the loader's own test for a declared row rather than a stricter one.
 * `next unless type_data['id']` skips a row only when the value is falsey,
 * and in Ruby that is nil and false alone: `id: ""`, `id: "   "` and `id: 42`
 * are all kept, interpolated into the IRI, and published. Declaring only the
 * ids that look well-formed would make this gate forgive precisely the row
 * that breaks a page — an empty id publishes the IRI prefix bare, so it
 * enters node/<kind>/index.jsonld, while export_document_type_nodes splits
 * that IRI and writes the file under its last surviving segment instead, and
 * the browse row 404s. A malformed id is a finding, not a row to look past.
 *
 * Stringified because the loader interpolates the value into the IRI, so a
 * YAML scalar that parses as a number here has to be compared as the string
 * the published index actually carries.
 *
 * The mirror stops at rows that are not mappings. Ruby reaches `['id']` on
 * whatever the row is: on a String that is a substring search, on an Array a
 * TypeError that the rescue turns into the loss of the whole file. Neither is
 * modelled. Both directions are safe — a row dropped here can only cause the
 * gate to expect less, never to blame a source for something it published,
 * and a file the loader abandons entirely still fails loudly through the rows
 * that did parse.
 *
 * A file that fails to parse is NOT treated as declaring nothing — the loader
 * rescues the parse error into a VERBOSE-gated warning and drops every
 * identifier in it, which is silent loss of a whole vocabulary and is exactly
 * what this gate exists to make loud.
 */
export function declaredIds(yamlText, yamlKey) {
  const data = parseYaml(yamlText);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const rows = data[yamlKey];
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
    .filter((row) => row.id !== undefined && row.id !== null && row.id !== false)
    .map((row) => String(row.id));
}

/**
 * Identifiers an index file publishes, keyed off the same string surgery the
 * browse pages perform. Throws on anything that is not one JSON object with a
 * nodes array of objects carrying a string @id, because the site reads
 * `indexData.nodes || []` and renders an empty page rather than an error for
 * every other shape.
 */
export function publishedIds(indexText, kind) {
  let index;
  try {
    index = JSON.parse(indexText);
  } catch (e) {
    throw new Error(`node/${kind}/index.jsonld is not valid JSON: ${e.message}`);
  }
  if (!index || typeof index !== 'object' || Array.isArray(index)) {
    throw new Error(`node/${kind}/index.jsonld is not a JSON object`);
  }
  if (!Array.isArray(index.nodes)) {
    throw new Error(`node/${kind}/index.jsonld has no nodes array`);
  }
  const prefix = `${BASE_URI}/${kind}/`;
  const ids = [];
  for (const node of index.nodes) {
    if (!node || typeof node !== 'object' || typeof node['@id'] !== 'string') {
      throw new Error(`node/${kind}/index.jsonld holds an entry with no string @id`);
    }
    if (node['@id'].startsWith(prefix)) ids.push(node['@id'].slice(prefix.length));
  }
  return ids;
}

/**
 * Run the gate.
 *
 * @param {object} opts
 * @param {string} opts.sourcesRoot directory holding the data-* clones
 * @param {string} opts.apiDir harmonized output root (public/api/v1)
 * @param {string[]} opts.sources source codes the harmonize run requested
 * @returns {{failures: string[], expectations: object[]}}
 */
export function verifySourceVocabularies({ sourcesRoot, apiDir, sources }) {
  const failures = [];
  const expectations = [];
  const publishedByKind = new Map();

  /** Read one index once, and turn an unreadable index into a failure rather than a throw. */
  const published = (kind) => {
    if (!publishedByKind.has(kind)) {
      const indexPath = path.join(apiDir, 'node', kind, 'index.jsonld');
      try {
        publishedByKind.set(kind, publishedIds(fs.readFileSync(indexPath, 'utf8'), kind));
      } catch (e) {
        publishedByKind.set(kind, null);
        failures.push(`${indexPath}: ${e.message}`);
      }
    }
    return publishedByKind.get(kind);
  };

  for (const source of sources) {
    const repoDir = path.join(sourcesRoot, repoDirFor(source));
    if (!fs.existsSync(repoDir)) {
      // Fail closed. A missing clone is indistinguishable from a source that
      // ships no vocabulary if absence is read as "nothing expected", and
      // that reading is how the original blind spot stayed green.
      failures.push(
        `Source ${source}: ${repoDir} is not present, so whether ${source} was ` +
          'expected to publish a vocabulary cannot be established. The gate ' +
          'refuses to certify the graph without its ground truth.',
      );
      continue;
    }

    for (const { kind, file, yamlKey } of VOCABULARIES) {
      const supportingPath = path.join(repoDir, 'sources', 'supporting', file);
      if (!fs.existsSync(supportingPath)) continue;

      let ids;
      try {
        ids = declaredIds(fs.readFileSync(supportingPath, 'utf8'), yamlKey);
      } catch (e) {
        failures.push(
          `Source ${source}: ${supportingPath} could not be parsed (${e.message}). ` +
            'harmonize rescues this into a warning and drops every ' +
            `${kind} in the file, so the graph loses ${source}'s whole vocabulary silently.`,
        );
        continue;
      }
      if (ids.length === 0) {
        failures.push(
          `Source ${source}: ${supportingPath} exists but declares no ${kind} under ` +
            `'${yamlKey}'. Either the file lost its contents or the key was renamed; ` +
            'both mean the vocabulary this repository ships stops reaching the graph.',
        );
        continue;
      }

      expectations.push({ source, kind, declared: ids.length, file: supportingPath });

      const publishedForKind = published(kind);
      if (publishedForKind === null) continue;

      const publishedSet = new Set(publishedForKind);
      const missingFromIndex = ids.filter((id) => !publishedSet.has(id));
      if (missingFromIndex.length > 0) {
        failures.push(
          `Source ${source}: ${missingFromIndex.length} of ${ids.length} ${kind}s declared in ` +
            `${supportingPath} are absent from node/${kind}/index.jsonld — ` +
            `${describeIds(missingFromIndex)}. ` +
            (missingFromIndex.length === ids.length
              ? `${source} contributed NO ${kind} vocabulary to the graph at all; its ` +
                'supplement directory never loaded.'
              : `${source}'s vocabulary loaded only in part.`) +
            ` /browse/${kind === 'organization' ? 'organizations' : 'document-types'} silently omits them.`,
        );
        continue;
      }

      // The index entry is only half of what a page needs: the browse page
      // strips the IRI prefix and fetches that path verbatim, so an entry
      // with no file behind it is a 404 per row rather than a missing row.
      const missingNodeFiles = ids.filter(
        (id) => !fs.existsSync(path.join(apiDir, 'node', kind, `${id}.jsonld`)),
      );
      if (missingNodeFiles.length > 0) {
        failures.push(
          `Source ${source}: ${missingNodeFiles.length} of ${ids.length} ${kind}s are listed in ` +
            `node/${kind}/index.jsonld with no node file behind them — ` +
            `${describeIds(missingNodeFiles)}. ` +
            `The site fetches api/v1/node/${kind}/<id>.jsonld for every index entry, so each is a 404.`,
        );
      }
    }
  }

  if (expectations.length === 0 && failures.length === 0) {
    // Every named source resolved to a clone and not one of them shipped a
    // vocabulary file. Six repositories do ship them, so this means the gate
    // was pointed somewhere that is not the harmonize input tree, and a gate
    // that passes because it found nothing to check is the defect being fixed.
    failures.push(
      `No source among [${sources.join(' ')}] ships sources/supporting/ under ${sourcesRoot}. ` +
        'The gate found nothing to assert, which it treats as a misconfiguration ' +
        'rather than a pass.',
    );
  }

  return { failures, expectations };
}

/**
 * Name the identifiers, capped so a whole-source loss does not bury the
 * message. Quoted because the ids the loader keeps include ones with no
 * printable characters at all — an empty or whitespace-only id is reported
 * here, and unquoted it would render as a gap in the sentence and read like
 * a formatting bug rather than the malformed row it is.
 */
function describeIds(ids) {
  const shown = ids.slice(0, 8);
  return shown.map((id) => JSON.stringify(id)).join(', ') +
    (ids.length > shown.length ? `, and ${ids.length - shown.length} more` : '');
}

/** The options below, so a value that is really the next flag can be spotted. */
const OPTIONS = new Set(['--sources-root', '--api-dir', '--sources']);

/**
 * Parse the command line, refusing an option whose value is missing.
 *
 * Every caller is a bash step in deploy.yml, so the diagnosis happens in a
 * job log rather than at a prompt. Left unchecked, `--api-dir` in final
 * position sets the option to undefined and the first path.join throws
 * `TypeError [ERR_INVALID_ARG_TYPE]` from deep inside node:path — a stack
 * trace pointing at the standard library, several hundred lines into a step,
 * for a typo in the line that invoked it. The option is named instead.
 *
 * A value that is itself one of the options is treated the same way: a
 * directory named `--api-dir` does not exist, so the reading that makes the
 * run silently wrong is never the one intended.
 */
export function parseArgs(argv) {
  const opts = { sourcesRoot: '.', apiDir: 'public/api/v1', sources: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!OPTIONS.has(flag)) throw new Error(`Unknown argument: ${flag}`);

    const value = argv[i + 1];
    if (value === undefined) throw new Error(`${flag} requires a value, and none followed it`);
    if (OPTIONS.has(value)) {
      throw new Error(`${flag} requires a value, but was followed by the option ${value}`);
    }

    if (flag === '--sources-root') opts.sourcesRoot = value;
    else if (flag === '--api-dir') opts.apiDir = value;
    else opts.sources = value.split(/\s+/).filter(Boolean);
    i += 1;
  }
  if (opts.sources.length === 0) throw new Error('--sources is required and must name at least one source');
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`verify-source-vocabularies: ${e.message}`);
    process.exit(2);
  }

  const { failures, expectations } = verifySourceVocabularies(opts);

  for (const e of expectations) {
    console.log(`Vocabulary expected: ${e.source} declares ${e.declared} ${e.kind}s in ${e.file}`);
  }
  if (failures.length > 0) {
    console.error('Vocabulary reachability check FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `Vocabulary reachability check passed: ${expectations.length} source vocabularies ` +
      'all reached the published graph.',
  );
}

// Only run when executed, so the tests can import the functions above.
// Compared as URLs rather than as paths: a workspace directory holding a
// space or a percent sign makes the two spellings differ.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
