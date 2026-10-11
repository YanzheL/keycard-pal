import type { DecodedCall, DecodedCallArg } from '@/utils/txParser';

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

function pickFromArgs(args: DecodedCallArg[], name: string): string | null {
  const match = args.find(a => a.name === name);
  return match ? match.value : null;
}

function calldataValue(call: DecodedCall, head: string): string | null {
  if (call.kind === 'erc20-transfer') {
    if (head === 'to' || head === '_to') return call.to;
    if (head === 'amount' || head === '_value' || head === 'value')
      return call.amount.toString();
    return null;
  }
  if (call.kind === 'erc20-transferFrom') {
    if (head === 'from' || head === '_from') return call.from;
    if (head === 'to' || head === '_to') return call.to;
    if (head === 'amount' || head === '_value' || head === 'value')
      return call.amount.toString();
    return null;
  }
  if (call.kind === 'erc20-approve') {
    if (head === 'spender' || head === '_spender') return call.spender;
    if (head === 'amount' || head === '_value' || head === 'value')
      return call.amount.toString();
    return null;
  }
  if (call.kind === 'contract-call') {
    return pickFromArgs(call.args, head);
  }
  return null;
}

export function buildCalldataPathResolver(
  call: DecodedCall,
  container: Eip7730Container = {},
): (path: string) => string | null {
  return (path: string) => {
    if (!path) return null;
    const { root, rest } = splitRoot(path);
    if (root === '@') return containerValue(rest, container);
    // `$.` points into the descriptor itself, which is not available here.
    if (root === '$') return null;
    return calldataValue(call, rest.split('.')[0]);
  };
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

function messageValue(path: string, message: unknown): string | null {
  let current: unknown = message;
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
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return null;
    }
    i = j;
  }
  if (current === null || current === undefined) return null;
  if (typeof current === 'object') return JSON.stringify(current);
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
  return messageValue(rest, message);
}
