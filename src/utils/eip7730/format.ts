import { formatUnits } from 'viem';

import { UNLIMITED_APPROVAL_WARNING } from '@/constants/approval';

import { getNativeCurrencySymbol } from '@/utils/chainMetadata';
import { lookupToken } from '@/utils/tokenMetadata';

import {
  isDecimals,
  type Eip7730DisplayFormat,
  type Eip7730Field,
} from './zip';

export type Eip7730FieldContext = {
  chainId?: number;
  contractAddress?: string;
  resolvePath: (path: string) => string | null;
  /** Every value a path selects, for inner-call fields over arrays. */
  resolveEach?: (path: string) => string[];
  /** How many inner calls deep this field sits; the top-level call is 0. */
  depth?: number;
};

export type Eip7730FieldDisplay = {
  text: string;
  warnings?: string[];
  unknownTokenAddress?: string;
};

export const UNKNOWN_TOKEN_WARNING = 'Unknown token';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ENUM_REF_PREFIX = '$.metadata.enums.';
const NATIVE_DECIMALS = 18;
// Spending permissions; "All" and "Max" withdraw the user's own funds.
const UNLIMITED_MESSAGES = new Set(['Unlimited', 'Any amount']);

type Params = Record<string, unknown> | undefined;
type TokenInfo = { decimals: number; symbol: string };

function toBigInt(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

// `$.metadata.constants` references are not resolved yet, so only literal addresses count.
function literalAddresses(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  return list
    .filter((v): v is string => typeof v === 'string' && ADDRESS_RE.test(v))
    .map(v => v.toLowerCase());
}

function nativeToken(chainId: number | undefined): TokenInfo | null {
  if (chainId === undefined) return null;
  return {
    decimals: NATIVE_DECIMALS,
    symbol: getNativeCurrencySymbol(chainId),
  };
}

function tokenAddress(params: Params, ctx: Eip7730FieldContext): string | null {
  const address =
    typeof params?.tokenPath === 'string'
      ? ctx.resolvePath(params.tokenPath)
      : typeof params?.token === 'string'
      ? params.token
      : null;
  return address && ADDRESS_RE.test(address) ? address.toLowerCase() : null;
}

function descriptorToken(
  format: Eip7730DisplayFormat,
  address: string,
  ctx: Eip7730FieldContext,
): TokenInfo | null {
  const tokens = format.metadata?.tokens;
  if (!tokens) return null;
  // `*` is the described contract's own metadata, never another token's.
  const own =
    ctx.contractAddress?.toLowerCase() === address ? tokens['*'] : undefined;
  const info = Object.prototype.hasOwnProperty.call(tokens, address)
    ? tokens[address]
    : own;
  if (!isDecimals(info?.decimals) || typeof info.ticker !== 'string') {
    return null;
  }
  return { decimals: info.decimals, symbol: info.ticker };
}

function resolveToken(
  format: Eip7730DisplayFormat,
  ctx: Eip7730FieldContext,
  params: Params,
  address: string | null,
): TokenInfo | null {
  if (!address) return null;
  if (literalAddresses(params?.nativeCurrencyAddress).includes(address)) {
    return nativeToken(ctx.chainId);
  }
  const fromDescriptor = descriptorToken(format, address, ctx);
  if (fromDescriptor) return fromDescriptor;
  const bundled = lookupToken(ctx.chainId, address);
  return bundled
    ? { decimals: bundled.decimals, symbol: bundled.symbol }
    : null;
}

function reachesThreshold(amount: bigint, threshold: unknown): boolean {
  if (typeof threshold !== 'string' && typeof threshold !== 'number') {
    return false;
  }
  const limit = toBigInt(String(threshold));
  return limit !== null && amount >= limit;
}

function trimAmount(raw: string): string {
  if (!raw.includes('.')) return raw;
  return raw.replace(/0+$/, '').replace(/\.$/, '');
}

function amountText(amount: bigint, token: TokenInfo): string {
  return `${trimAmount(formatUnits(amount, token.decimals))} ${token.symbol}`;
}

function message(params: Params, fallback: string): string {
  return typeof params?.message === 'string' ? params.message : fallback;
}

function formatTokenAmount(
  value: string,
  format: Eip7730DisplayFormat,
  ctx: Eip7730FieldContext,
  params: Params,
): Eip7730FieldDisplay {
  const amount = toBigInt(value);
  if (amount === null) return { text: value };
  const address = tokenAddress(params, ctx);
  const token = resolveToken(format, ctx, params, address);
  // Without a ticker the address is the only way to tell which token this is.
  const unknown = !token && address ? { unknownTokenAddress: address } : {};
  if (!reachesThreshold(amount, params?.threshold)) {
    return token
      ? { text: amountText(amount, token) }
      : { text: value, warnings: [UNKNOWN_TOKEN_WARNING], ...unknown };
  }
  const text = message(params, 'Unlimited');
  const warnings = UNLIMITED_MESSAGES.has(text)
    ? [UNLIMITED_APPROVAL_WARNING]
    : [];
  if (!token) warnings.push(UNKNOWN_TOKEN_WARNING);
  return {
    text: token ? `${text} ${token.symbol}` : text,
    ...(warnings.length > 0 && { warnings }),
    ...unknown,
  };
}

function formatAmount(
  value: string,
  ctx: Eip7730FieldContext,
  params: Params,
): Eip7730FieldDisplay {
  const amount = toBigInt(value);
  if (amount === null) return { text: value };
  if (reachesThreshold(amount, params?.threshold)) {
    return { text: message(params, 'All') };
  }
  const native = nativeToken(ctx.chainId);
  return { text: native ? amountText(amount, native) : value };
}

function formatDate(value: string): string {
  const date = new Date(Number(value) * 1000);
  // A maximum value means "never expires"; it is past any date JS can show.
  return Number(value) > 0 && !Number.isNaN(date.getTime())
    ? date.toLocaleString()
    : value;
}

function formatEnum(
  value: string,
  format: Eip7730DisplayFormat,
  params: Params,
): string {
  const ref = typeof params?.$ref === 'string' ? params.$ref : undefined;
  if (!ref) return value;
  const id = ref.startsWith(ENUM_REF_PREFIX)
    ? ref.slice(ENUM_REF_PREFIX.length)
    : ref;
  const labels = format.metadata?.enums?.[id];
  const label =
    labels && Object.prototype.hasOwnProperty.call(labels, value)
      ? labels[value]
      : null;
  return typeof label === 'string' ? label : value;
}

export function formatEip7730Field(
  field: Eip7730Field,
  value: string | null,
  format: Eip7730DisplayFormat,
  ctx: Eip7730FieldContext,
): Eip7730FieldDisplay {
  if (value === null) return { text: '—' };
  try {
    switch (field.format) {
      case 'tokenAmount':
        return formatTokenAmount(value, format, ctx, field.params);
      case 'amount':
        return formatAmount(value, ctx, field.params);
      case 'date':
        return { text: formatDate(value) };
      case 'enum':
        return { text: formatEnum(value, format, field.params) };
      default:
        return { text: value };
    }
  } catch {
    // A descriptor from a later registry must never take the review screen down.
    return { text: value };
  }
}
