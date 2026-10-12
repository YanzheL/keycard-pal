import { loadSlice } from '@/storage/eip7730Index';

import {
  indexedFormat,
  sliceName,
  type Eip7730DisplayFormat,
  type Eip7730Index,
  type Eip7730IndexSlice,
} from './zip';

export type SavedIndex = { generatedAt: string };

/** Answers at once from the bundled index or a slice already read, else once the slice is read. */
export type FormatLookup =
  | Eip7730DisplayFormat
  | null
  | Promise<Eip7730DisplayFormat | null>;

// An external store: imports, downloads and the startup restore all write it outside React.
let saved: SavedIndex | null = null;
let bundled: Eip7730Index | null = null;
const slices = new Map<string, Eip7730IndexSlice | null>();
const reading = new Map<string, Promise<Eip7730IndexSlice | null>>();
const listeners = new Set<() => void>();

export function setSavedIndex(next: SavedIndex | null): void {
  saved = next;
  slices.clear();
  reading.clear();
  listeners.forEach(listener => listener());
}

export function getSavedIndex(): SavedIndex | null {
  return saved;
}

export function subscribeSavedIndex(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function bundledIndex(): Eip7730Index {
  // Required here, not imported: with a saved index the bundled one is never built.
  if (!bundled) bundled = require('@/data/eip7730.json') as Eip7730Index;
  return bundled;
}

function fromActive(
  address: string,
  read: (source: Eip7730IndexSlice) => Eip7730DisplayFormat | null,
): FormatLookup {
  if (!saved) return read(bundledIndex());
  const name = sliceName(address);
  if (slices.has(name)) {
    const slice = slices.get(name);
    return slice ? read(slice) : null;
  }
  let pending = reading.get(name);
  if (!pending) {
    const source = saved;
    pending = loadSlice(name).then(slice => {
      // A slice of a source replaced meanwhile must not be cached for the new one.
      if (saved === source) slices.set(name, slice);
      return slice;
    });
    reading.set(name, pending);
  }
  return pending.then(slice => (slice ? read(slice) : null));
}

export function lookupCalldata(
  chainId: number,
  contractAddress: string,
  selector: string,
): FormatLookup {
  if (!Number.isFinite(chainId) || !contractAddress || !selector) return null;
  const address = contractAddress.toLowerCase();
  return fromActive(address, source =>
    indexedFormat(
      source,
      'contracts',
      chainId,
      address,
      selector.toLowerCase(),
    ),
  );
}

function domainMatches(
  required: Record<string, string> | undefined,
  domain: Record<string, unknown>,
): boolean {
  if (!required) return true;
  return Object.entries(required).every(
    ([key, value]) =>
      domain[key] !== undefined && String(domain[key]) === value,
  );
}

// The spec keys EIP-712 formats by `encodeType`, never by the bare primary type.
export function lookupEip712(
  chainId: number,
  verifyingContract: string,
  encodedType: string,
  domain: Record<string, unknown>,
): FormatLookup {
  if (!Number.isFinite(chainId) || !verifyingContract || !encodedType)
    return null;
  const address = verifyingContract.toLowerCase();
  return fromActive(address, source => {
    const format = indexedFormat(
      source,
      'eip712',
      chainId,
      address,
      encodedType,
    );
    return format && domainMatches(format.domain, domain) ? format : null;
  });
}
