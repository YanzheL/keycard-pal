#!/usr/bin/env node
// Built with the app's own parser, so the bundled index and an import from Settings agree.

const fs = require('fs');
const https = require('https');
const path = require('path');
const { createPublicClient, http } = require('viem');

const ZIP_URL =
  process.env.EIP7730_REGISTRY_URL ||
  'https://github.com/ethereum/clear-signing-erc7730-registry/archive/refs/heads/master.zip';
// Revocations live on mainnet only; a failed lookup fails the run rather than skipping it.
const RPC_URL =
  process.env.EIP7730_RPC_URL || 'https://ethereum-rpc.publicnode.com';
const GET_REVOKE_OFFCHAIN = [
  {
    type: 'function',
    name: 'getRevokeOffchain',
    stateMutability: 'view',
    inputs: [
      { name: 'revoker', type: 'address' },
      { name: 'uid', type: 'bytes32' },
    ],
    outputs: [{ name: '', type: 'uint64' }],
  },
];
const OUT = path.join(__dirname, '..', 'src', 'data', 'eip7730.json');
// The startup check compares a saved index with this, without building the bundled one.
const META = path.join(__dirname, '..', 'src', 'data', 'eip7730.meta.json');
// An import on the phone skips recovering these signatures again.
const ATTESTATIONS = path.join(
  __dirname,
  '..',
  'src',
  'data',
  'eip7730.attestations.json',
);

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

async function revokedAttestations(accepted, { EAS_CONTRACT, revocationKey }) {
  const client = createPublicClient({
    transport: http(RPC_URL, { batch: { batchSize: 50 }, retryCount: 3 }),
  });
  const revokedAt = await Promise.all(
    accepted.map(a =>
      client.readContract({
        address: EAS_CONTRACT,
        abi: GET_REVOKE_OFFCHAIN,
        functionName: 'getRevokeOffchain',
        args: [a.attester, a.uid],
      }),
    ),
  );
  return new Set(
    accepted.filter((_, i) => revokedAt[i] !== 0n).map(revocationKey),
  );
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
  // Through import(), where the --import hook in package.json resolves src/'s extensionless imports.
  const { acceptedAttestations, isEmptyIndex, processRegistryZip } =
    await import('../src/utils/eip7730/zip.ts');
  const attestation = await import('../src/utils/eip7730/attestation.ts');
  const { revocationKey } = attestation;

  console.log(`Fetching ${ZIP_URL}...`);
  const buf = await get(ZIP_URL);
  console.log(`Downloaded ${buf.length} bytes. Building the index...`);

  const zip = new Uint8Array(buf);
  const accepted = acceptedAttestations(zip);
  console.log(
    `Checking ${accepted.length} attestations for revocation at ${RPC_URL}...`,
  );
  const revoked = await revokedAttestations(accepted, attestation);
  const index = processRegistryZip(zip, { revoked });
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
  const verified = {};
  for (const a of accepted) {
    if (!revoked.has(revocationKey(a))) verified[a.uid] = a.attester;
  }
  const sorted = Object.fromEntries(Object.entries(verified).sort());
  fs.writeFileSync(ATTESTATIONS, JSON.stringify(sorted, null, 2) + '\n');

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
  console.log(
    `${index.formats.filter(f => f.reviewedBy).length} formats reviewed; ` +
      `${revoked.size} of ${accepted.length} attestations revoked.`,
  );
  console.log(`Wrote ${OUT}, ${META} and ${ATTESTATIONS}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
