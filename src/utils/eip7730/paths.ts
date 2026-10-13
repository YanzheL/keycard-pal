import {
  decodeAbiParameters,
  parseAbiItem,
  toFunctionSelector,
  type AbiFunction,
} from 'viem';

export type Eip7730Container = {
  from?: string;
  to?: string;
  value?: string;
  chainId?: number;
};

type Root = '#' | '@' | '$';

function splitRoot(path: string): { root: Root; rest: string } {
  if (path.startsWith('@.')) return { root: '@', rest: path.slice(2) };
  if (path.startsWith('$.')) return { root: '$', rest: path.slice(2) };
  if (path.startsWith('#.')) return { root: '#', rest: path.slice(2) };
  return { root: '#', rest: path };
}

function containerValue(
  key: string,
  container: Eip7730Container,
): string | null {
  switch (key) {
    case 'from':
      return container.from ?? null;
    case 'to':
      return container.to ?? null;
    case 'value':
      return container.value ?? null;
    case 'chainId':
      return container.chainId === undefined ? null : String(container.chainId);
    default:
      return null;
  }
}

function indexOfClosingBracket(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i += 1) {
    const c = s[i];
    if (c === '[') depth += 1;
    else if (c === ']') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

const SLICE_RE = /^(-?\d+)?:(-?\d+)?$/;
const WORD = 2n ** 256n;

export function sliceRange(
  length: number,
  start: string | undefined,
  end: string | undefined,
): [number, number] {
  const at = (text: string | undefined, fallback: number) => {
    if (text === undefined || text === '') return fallback;
    const n = Number(text);
    return Math.min(length, Math.max(0, n < 0 ? length + n : n));
  };
  return [at(start, 0), at(end, length)];
}

function wordHex(n: bigint): string | null {
  const v = n < 0n ? WORD + n : n;
  return v >= 0n && v < WORD ? v.toString(16).padStart(64, '0') : null;
}

// The spec slices a number as its 32-byte ABI word.
function bytesHex(value: unknown): string | null {
  if (typeof value === 'bigint') return wordHex(value);
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? wordHex(BigInt(value)) : null;
  }
  if (typeof value !== 'string') return null;
  if (/^0x([0-9a-f]{2})*$/i.test(value)) return value.slice(2).toLowerCase();
  if (/^(0x[0-9a-f]+|-?\d+)$/i.test(value)) return wordHex(BigInt(value));
  return null;
}

function select(value: unknown, selector: string): unknown[] {
  if (selector === '' || selector === '*') {
    return Array.isArray(value) ? value : [];
  }
  if (/^-?\d+$/.test(selector)) {
    if (!Array.isArray(value)) return [];
    const n = Number(selector);
    const index = n < 0 ? value.length + n : n;
    return index >= 0 && index < value.length ? [value[index]] : [];
  }
  const slice = SLICE_RE.exec(selector);
  if (!slice) return [];
  if (Array.isArray(value)) {
    const [start, end] = sliceRange(value.length, slice[1], slice[2]);
    return value.slice(start, end);
  }
  const hex = bytesHex(value);
  if (hex === null) return [];
  const [start, end] = sliceRange(hex.length / 2, slice[1], slice[2]);
  return start < end ? [`0x${hex.slice(start * 2, end * 2)}`] : [];
}

function valuesAt(path: string, root: unknown): unknown[] {
  let current: unknown[] = [root];
  let i = 0;
  while (i < path.length && current.length > 0) {
    if (path[i] === '.') {
      i += 1;
      continue;
    }
    if (path[i] === '[') {
      const end = indexOfClosingBracket(path, i + 1);
      if (end === -1) return [];
      const selector = path.slice(i + 1, end);
      current = current.flatMap(value => select(value, selector));
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== '.' && path[j] !== '[') j += 1;
    const key = path.slice(i, j);
    current = current.flatMap(value =>
      value &&
      typeof value === 'object' &&
      Object.prototype.hasOwnProperty.call(value, key)
        ? [(value as Record<string, unknown>)[key]]
        : [],
    );
    i = j;
  }
  return current.filter(value => value !== null && value !== undefined);
}

function toText(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
  }
  return String(value);
}

function valueAt(path: string, root: unknown): string | null {
  const [first] = valuesAt(path, root);
  return first === undefined ? null : toText(first);
}

function resolveEach(
  path: string,
  root: unknown,
  container: Eip7730Container,
): string[] {
  if (!path) return [];
  const split = splitRoot(path);
  if (split.root === '@') {
    const value = containerValue(split.rest, container);
    return value === null ? [] : [value];
  }
  if (split.root === '$') return [];
  return valuesAt(split.rest, root).map(toText);
}

export function resolveEip712FieldValue(
  path: string,
  message: unknown,
  container: Eip7730Container = {},
): string | null {
  if (!path) return null;
  const { root, rest } = splitRoot(path);
  if (root === '@') return containerValue(rest, container);
  if (root === '$') return null;
  return valueAt(rest, message);
}

/** Arguments named as the descriptor's own signature names them, or null when it does not fit. */
export function decodeArgsBySignature(
  signature: string,
  data: string,
): Record<string, unknown> | null {
  try {
    const item = parseAbiItem(`function ${signature}`) as AbiFunction;
    if (toFunctionSelector(item) !== data.slice(0, 10).toLowerCase()) {
      return null;
    }
    const values = decodeAbiParameters(
      item.inputs,
      `0x${data.slice(10)}` as `0x${string}`,
    );
    return Object.fromEntries(
      item.inputs.map((input, i) => [input.name || String(i), values[i]]),
    );
  } catch {
    return null;
  }
}

export function resolveEip712FieldValues(
  path: string,
  message: unknown,
  container: Eip7730Container = {},
): string[] {
  return resolveEach(path, message, container);
}

export function buildArgsEachResolver(
  args: Record<string, unknown>,
  container: Eip7730Container = {},
): (path: string) => string[] {
  return (path: string) => resolveEach(path, args, container);
}

export function buildArgsPathResolver(
  args: Record<string, unknown>,
  container: Eip7730Container = {},
): (path: string) => string | null {
  return (path: string) => {
    if (!path) return null;
    const { root, rest } = splitRoot(path);
    if (root === '@') return containerValue(rest, container);
    // `$.` points into the descriptor itself, which is not available here.
    if (root === '$') return null;
    return valueAt(rest, args);
  };
}
