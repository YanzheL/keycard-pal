// scripts/generate-eip7730.js loads this file under plain Node: no `@/` imports, no React Native.
import * as secp from '@noble/secp256k1';
import {
  encodePacked,
  getAddress,
  hashTypedData,
  hexToBytes,
  keccak256,
  stringToBytes,
  toHex,
  zeroAddress,
  type Hex,
} from 'viem';

type Json = Record<string, unknown>;

const ADDRESS_RE = /^0x[0-9a-f]{40}$/i;

function isPlainObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ERC-8176 attesters the app trusts, checksummed address to the name a review shows. */
export const TRUSTED_ATTESTERS: ReadonlyMap<string, string> = new Map([
  ['0x3846c3A30E62075Fa916216b35EF04B8F53931f6', 'Cyfrin'],
]);
/** The EAS contract on mainnet that ERC-8176 fixes; revocations are read from it. */
export const EAS_CONTRACT = '0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587';
const ATTESTATION_SCHEMA =
  '0xe023eef113c1670774801c34b377fdf612dd8a4d2fa92fe382e15bd91fafb5c2';
const EAS_DOMAIN = {
  name: 'EAS Attestation',
  version: '0.26',
  chainId: 1,
  verifyingContract: EAS_CONTRACT,
} as const;
const ATTEST_TYPES = {
  Attest: [
    { name: 'version', type: 'uint16' },
    { name: 'schema', type: 'bytes32' },
    { name: 'recipient', type: 'address' },
    { name: 'time', type: 'uint64' },
    { name: 'expirationTime', type: 'uint64' },
    { name: 'revocable', type: 'bool' },
    { name: 'refUID', type: 'bytes32' },
    { name: 'data', type: 'bytes' },
    { name: 'salt', type: 'bytes32' },
  ],
} as const;
const BYTES32_RE = /^0x[0-9a-f]{64}$/i;
const UINT64_RE = /^\d{1,20}$/;
const SIGS_RE = /^(.*)\/sigs\/([^/]+)\.eip155-1-(0x[0-9a-f]{40})\.json$/i;

/** An attestation that passed every offline check, from a trusted attester. */
export type AcceptedAttestation = { attester: string; uid: Hex };

export type AttestationOptions = {
  /** `revocationKey` of every attestation revoked on chain. */
  revoked?: ReadonlySet<string>;
  /** Uid to attester of attestations already verified; recovering a signature takes 65 ms on a phone. */
  verified?: ReadonlyMap<string, string>;
  now?: number;
};

export function revocationKey(attestation: AcceptedAttestation): string {
  return `${attestation.attester.toLowerCase()}:${attestation.uid.toLowerCase()}`;
}

/** RFC 8785, which ERC-8176 hashes: sorted keys, and JSON.stringify's own strings and numbers. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    const members = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(',')}}`;
  }
  const text =
    typeof value === 'number' && !Number.isFinite(value)
      ? undefined
      : JSON.stringify(value);
  if (text === undefined) throw new Error('Not a JSON value');
  return text;
}

/** ERC-8176's descriptorHash, taken over the descriptor with its includes resolved. */
export function descriptorHash(descriptor: unknown): Hex {
  return keccak256(stringToBytes(canonicalJson(descriptor)));
}

function isBytes32(value: unknown): value is Hex {
  return typeof value === 'string' && BYTES32_RE.test(value);
}

function isUint64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    UINT64_RE.test(value) &&
    BigInt(value) < 2n ** 64n
  );
}

function recoverAttester(digest: Hex, signature: Json): string | null {
  const { r, s, v } = signature;
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  const recovery = v >= 27 ? v - 27 : v;
  if (!isBytes32(r) || !isBytes32(s) || (recovery !== 0 && recovery !== 1)) {
    return null;
  }
  try {
    const sig = new secp.Signature(BigInt(r), BigInt(s), recovery);
    const key = secp.recoverPublicKey(
      sig.toBytes('recovered'),
      hexToBytes(digest),
      { prehash: false },
    );
    const uncompressed = secp.Point.fromBytes(key).toBytes(false);
    return getAddress(`0x${keccak256(uncompressed.slice(1)).slice(-40)}`);
  } catch {
    return null;
  }
}

/** ERC-8176 steps 1 to 5 and the trust check; revocation needs the network, so it is the caller's. */
export function checkAttestation(
  raw: unknown,
  hash: Hex,
  now: number = Date.now(),
  verified?: ReadonlyMap<string, string>,
): AcceptedAttestation | null {
  const sig = isPlainObject(raw) ? raw.sig : undefined;
  if (!isPlainObject(sig)) return null;
  const { message: m, signature } = sig;
  if (!isPlainObject(m) || !isPlainObject(signature)) return null;
  if (
    m.version !== 2 ||
    typeof m.schema !== 'string' ||
    m.schema.toLowerCase() !== ATTESTATION_SCHEMA ||
    !isBytes32(m.data) ||
    m.data.toLowerCase() !== hash.toLowerCase() ||
    typeof m.recipient !== 'string' ||
    !ADDRESS_RE.test(m.recipient) ||
    !isUint64(m.time) ||
    !isUint64(m.expirationTime) ||
    typeof m.revocable !== 'boolean' ||
    !isBytes32(m.refUID) ||
    !isBytes32(m.salt)
  ) {
    return null;
  }
  const expires = BigInt(m.expirationTime);
  if (expires !== 0n && expires * 1000n <= BigInt(Math.floor(now))) return null;

  const message = {
    version: 2,
    schema: m.schema as Hex,
    recipient: m.recipient as Hex,
    time: BigInt(m.time),
    expirationTime: expires,
    revocable: m.revocable,
    refUID: m.refUID,
    data: m.data,
    salt: m.salt,
  };
  // Never the file's own uid: it is unsigned, and revocation is keyed on it. EAS packs the schema as text.
  const uid = keccak256(
    encodePacked(
      [
        'uint16',
        'bytes',
        'address',
        'address',
        'uint64',
        'uint64',
        'bool',
        'bytes32',
        'bytes',
        'bytes32',
        'uint32',
      ],
      [
        message.version,
        toHex(stringToBytes(message.schema)),
        message.recipient,
        zeroAddress,
        message.time,
        message.expirationTime,
        message.revocable,
        message.refUID,
        message.data,
        message.salt,
        0,
      ],
    ),
  );
  // The uid commits to every signed field, so a verified uid vouches for this message.
  const known = verified?.get(uid);
  if (known && TRUSTED_ATTESTERS.has(known)) return { attester: known, uid };

  const digest = hashTypedData({
    domain: EAS_DOMAIN,
    types: ATTEST_TYPES,
    primaryType: 'Attest',
    message,
  });
  const attester = recoverAttester(digest, signature);
  if (!attester || !TRUSTED_ATTESTERS.has(attester)) return null;
  return { attester, uid };
}

// Only files named after a trusted attester, one each, so a crafted zip cannot make an import verify thousands.
export function attestationFiles(
  files: ReadonlyMap<string, unknown>,
): Map<string, unknown[]> {
  const trusted = new Set(
    [...TRUSTED_ATTESTERS.keys()].map(a => a.toLowerCase()),
  );
  const byDescriptor = new Map<string, Map<string, unknown>>();
  for (const [path, doc] of files) {
    const match = SIGS_RE.exec(path);
    if (!match || !trusted.has(match[3].toLowerCase())) continue;
    const descriptor = `${match[1]}/${match[2]}.json`;
    let byAttester = byDescriptor.get(descriptor);
    if (!byAttester) {
      byAttester = new Map();
      byDescriptor.set(descriptor, byAttester);
    }
    if (!byAttester.has(match[3].toLowerCase())) {
      byAttester.set(match[3].toLowerCase(), doc);
    }
  }
  const out = new Map<string, unknown[]>();
  for (const [descriptor, byAttester] of byDescriptor) {
    out.set(descriptor, [...byAttester.values()]);
  }
  return out;
}

export function reviewersOf(
  resolved: Json,
  attestations: unknown[] | undefined,
  options: AttestationOptions,
  accepted: AcceptedAttestation[],
): string[] | undefined {
  if (!attestations) return undefined;
  try {
    const hash = descriptorHash(resolved);
    const reviewers = new Set<string>();
    for (const raw of attestations) {
      const attestation = checkAttestation(
        raw,
        hash,
        options.now,
        options.verified,
      );
      if (!attestation) continue;
      accepted.push(attestation);
      if (!options.revoked?.has(revocationKey(attestation))) {
        reviewers.add(attestation.attester);
      }
    }
    return reviewers.size ? [...reviewers].sort() : undefined;
  } catch {
    // A descriptor that cannot be hashed is shown, unreviewed.
    return undefined;
  }
}
