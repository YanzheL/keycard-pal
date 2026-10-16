#!/usr/bin/env node
/**
 * Downloads the clear-signing EIP-7730 registry and writes the descriptor index
 * to src/data/eip7730.json with the app's own parser, so the bundled index and
 * an import from Settings are built the same way.
 *
 * Source: https://github.com/ethereum/clear-signing-erc7730-registry
 *
 * To update: npm run generate:eip7730, then commit the JSON diff.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const {
  processRegistryZip,
  isEmptyIndex,
} = require('../src/utils/eip7730/zip.ts');

const ZIP_URL =
  process.env.EIP7730_REGISTRY_URL ||
  'https://github.com/ethereum/clear-signing-erc7730-registry/archive/refs/heads/master.zip';
const OUT = path.join(__dirname, '..', 'src', 'data', 'eip7730.json');
// The startup check compares a saved index with this, without building the bundled one.
const META = path.join(__dirname, '..', 'src', 'data', 'eip7730.meta.json');

function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'));
    https
      .get(url, res => {
        if (
          (res.statusCode === 301 ||
            res.statusCode === 302 ||
            res.statusCode === 307 ||
            res.statusCode === 308) &&
          res.headers.location
        ) {
          res.resume();
          return get(res.headers.location, redirects + 1)
            .then(resolve)
            .catch(reject);
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

// GitHub writes the archive's commit into the zip comment; CI tests against that commit.
function zipComment(buf) {
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      const length = buf.readUInt16LE(i + 20);
      return buf
        .subarray(i + 22, i + 22 + length)
        .toString('utf8')
        .trim();
    }
  }
  return '';
}

function entryCount(bucket) {
  let sum = 0;
  for (const byKey of Object.values(bucket)) {
    for (const byChain of Object.values(byKey))
      sum += Object.keys(byChain).length;
  }
  return sum;
}

async function main() {
  console.log(`Fetching ${ZIP_URL}...`);
  const buf = await get(ZIP_URL);
  console.log(`Downloaded ${buf.length} bytes. Building the index...`);

  const index = processRegistryZip(new Uint8Array(buf));
  if (isEmptyIndex(index)) {
    throw new Error(
      'The registry zip yielded no descriptors; nothing written.',
    );
  }

  const commit = zipComment(buf);
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error('The registry zip names no commit; nothing written.');
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(index, null, 2) + '\n');
  fs.writeFileSync(
    META,
    JSON.stringify(
      { generatedAt: index.generatedAt, registryCommit: commit },
      null,
      2,
    ) + '\n',
  );

  console.log(
    `Index v${index.version}: ${index.formats.length} formats for ` +
      `${entryCount(index.contracts)} calldata entries across ` +
      `${Object.keys(index.contracts).length} contracts and ${entryCount(
        index.eip712,
      )} ` +
      `EIP-712 entries across ${
        Object.keys(index.eip712).length
      } verifying contracts.`,
  );
  console.log(`Wrote ${OUT} and ${META}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
