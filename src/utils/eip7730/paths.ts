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

/** Every value a path selects; `[]` and `[*]` take each element, which only inner calls use so far. */
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
      const inner = path.slice(i + 1, end);
      current = current.flatMap(value => {
        if (!Array.isArray(value)) return [];
        if (inner === '' || inner === '*') return value;
        const index = Number(inner);
        return Number.isInteger(index) && index >= 0 && index < value.length
          ? [value[index]]
          : [];
      });
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
