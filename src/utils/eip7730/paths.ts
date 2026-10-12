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

function valueAt(path: string, root: unknown): string | null {
  let current: unknown = root;
  let i = 0;
  while (i < path.length && current !== null && current !== undefined) {
    if (path[i] === '.') {
      i += 1;
      continue;
    }
    if (path[i] === '[') {
      const end = indexOfClosingBracket(path, i + 1);
      if (end === -1) return null;
      const inner = path.slice(i + 1, end);
      if (inner === ']' || inner === '' || inner === '*') {
        if (Array.isArray(current) && current.length > 0) current = current[0];
        else return null;
      } else {
        const idx = Number(inner);
        if (!Number.isFinite(idx)) return null;
        if (Array.isArray(current)) current = current[idx];
        else return null;
      }
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < path.length && path[j] !== '.' && path[j] !== '[') j += 1;
    const key = path.slice(i, j);
    if (
      current &&
      typeof current === 'object' &&
      Object.prototype.hasOwnProperty.call(current, key)
    ) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return null;
    }
    i = j;
  }
  if (current === null || current === undefined) return null;
  if (typeof current === 'object') {
    return JSON.stringify(current, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
  }
  return String(current);
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
