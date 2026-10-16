#!/usr/bin/env node
/**
 * Runs the clear-signing registry's v2 test vectors through the app's own lookup, decoding
 * and rendering, against the registry commit the app bundles (src/data/eip7730.meta.json).
 * Fails when a vector in the baseline no longer renders as the registry expects.
 *
 *   npm run check:eip7730-vectors                 download that commit and check
 *   npm run check:eip7730-vectors -- --zip <file> check a registry zip already on disk
 *   npm run check:eip7730-vectors -- --update     write the passing vectors as the baseline
 */

const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { unzipSync } = require('fflate');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(__dirname, 'eip7730-vectors');
const BASELINE = path.join(DIR, 'baseline.json');
const META = require('../src/data/eip7730.meta.json');

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'));
    https
      .get(url, res => {
        if (
          [301, 302, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          return get(res.headers.location, redirects + 1).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function option(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

async function registryZip() {
  const local = option('--zip');
  if (local) return fs.readFileSync(path.resolve(local));
  const commit = META.registryCommit;
  if (!/^[0-9a-f]{40}$/.test(commit ?? '')) {
    throw new Error(
      'src/data/eip7730.meta.json names no registry commit; run npm run generate:eip7730.',
    );
  }
  const url = `https://github.com/ethereum/clear-signing-erc7730-registry/archive/${commit}.zip`;
  console.log(`Fetching ${url}`);
  return get(url);
}

async function main() {
  const zip = await registryZip();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'eip7730-vectors-'));
  try {
    check(zip, work);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function check(zip, work) {
  const zipPath = path.join(work, 'registry.zip');
  fs.writeFileSync(zipPath, zip);

  const vectorsDir = path.join(work, 'registry');
  const files = unzipSync(new Uint8Array(zip), {
    filter: file => /\/testsv2\/[^/]+\.json$/.test(file.name),
  });
  for (const [name, bytes] of Object.entries(files)) {
    // GitHub archives put everything under one top-level folder.
    const target = path.resolve(vectorsDir, name.split('/').slice(1).join('/'));
    if (!target.startsWith(vectorsDir + path.sep)) {
      throw new Error(
        `The archive entry ${name} points outside the work folder.`,
      );
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }

  const reportPath = path.join(work, 'report.json');
  const run = spawnSync(
    'npx',
    ['jest', '-c', path.join(DIR, 'jest.config.js'), '--silent'],
    {
      cwd: ROOT,
      stdio: 'inherit',
      // The registry writes its expected dates in UTC.
      env: {
        ...process.env,
        TZ: 'UTC',
        VECTORS_ZIP: zipPath,
        VECTORS_DIR: vectorsDir,
        VECTORS_REPORT: reportPath,
      },
    },
  );
  if (run.status !== 0 || !fs.existsSync(reportPath)) {
    throw new Error('The vector harness did not finish.');
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const passing = report.results
    .filter(r => r.status === 'pass')
    .map(r => r.id)
    .sort();
  const { summary } = report;
  console.log(
    `${summary.pass} of ${summary.tests} vectors render as the registry expects ` +
      `(${summary.diff} differ, ${summary.unmatched} match no entry, ` +
      `${summary.refused} refused as unsignable, ${summary.error} error).`,
  );

  if (process.argv.includes('--update')) {
    fs.writeFileSync(
      BASELINE,
      JSON.stringify(
        { registryCommit: META.registryCommit, passing },
        null,
        2,
      ) + '\n',
    );
    console.log(`Wrote ${path.relative(ROOT, BASELINE)}.`);
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const now = new Set(passing);
  const lost = baseline.passing.filter(id => !now.has(id));
  const gained = passing.filter(id => !baseline.passing.includes(id));
  if (gained.length > 0) {
    console.log(
      `${gained.length} vector(s) pass that the baseline does not list; run with --update to record them.`,
    );
  }
  if (lost.length > 0) {
    console.error(`${lost.length} vector(s) in the baseline no longer pass:`);
    for (const id of lost) {
      const result = report.results.find(r => r.id === id);
      console.error(
        `  ${id}: ${result ? result.status : 'missing from the run'}`,
      );
      for (const [label, value] of result?.missing ?? []) {
        console.error(`    expected ${label}: ${value}`);
      }
    }
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exit(1);
});
