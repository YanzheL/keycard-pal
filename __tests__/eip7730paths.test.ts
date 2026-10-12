import { encodeFunctionData, parseAbiItem, type AbiFunction } from 'viem';

import {
  buildArgsPathResolver,
  decodeArgsBySignature,
  resolveEip712FieldValue,
} from '../src/utils/eip7730/paths';

const SWAP =
  'swap(address executor,(address srcToken,address dstToken,uint256 amount) desc,bytes data,uint256[] ids)';
const RECIPIENT = '0xD3CDa913deb6F4967B2eF3Aa68F5a843da74c4Ef';
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

function calldata(signature: string, args: unknown[]): string {
  return encodeFunctionData({
    abi: [parseAbiItem(`function ${signature}`) as AbiFunction],
    args,
  });
}

const swapData = calldata(SWAP, [
  RECIPIENT,
  { srcToken: TOKEN, dstToken: RECIPIENT, amount: 1500000n },
  '0x1234',
  [7n, 8n],
]);

describe('decodeArgsBySignature', () => {
  it("names arguments, structs included, by the descriptor's own signature", () => {
    const args = decodeArgsBySignature(SWAP, swapData);
    expect(args).not.toBeNull();
    expect(args!.executor).toBe(RECIPIENT);
    expect(args!.desc).toEqual({
      srcToken: TOKEN,
      dstToken: RECIPIENT,
      amount: 1500000n,
    });
    expect(args!.ids).toEqual([7n, 8n]);
  });

  it('names an unnamed parameter by its position', () => {
    const data = calldata('transfer(address,uint256)', [RECIPIENT, 5n]);
    expect(decodeArgsBySignature('transfer(address,uint256)', data)).toEqual({
      0: RECIPIENT,
      1: 5n,
    });
  });

  it('refuses calldata whose selector is another function', () => {
    const data = calldata('approve(address spender,uint256 amount)', [
      RECIPIENT,
      5n,
    ]);
    expect(
      decodeArgsBySignature('transfer(address to,uint256 amount)', data),
    ).toBeNull();
  });

  it('refuses bytes that do not fit the types, and a signature it cannot parse', () => {
    expect(
      decodeArgsBySignature(
        'transfer(address to,uint256 amount)',
        '0xa9059cbb1234',
      ),
    ).toBeNull();
    expect(decodeArgsBySignature('not a signature', swapData)).toBeNull();
  });
});

describe('buildArgsPathResolver', () => {
  const r = buildArgsPathResolver(decodeArgsBySignature(SWAP, swapData)!, {
    from: '0xsigner',
    to: '0xrouter',
    value: '0',
    chainId: 10,
  });

  it('walks into structs and arrays', () => {
    expect(r('desc.amount')).toBe('1500000');
    expect(r('#.desc.srcToken')).toBe(TOKEN);
    expect(r('ids[1]')).toBe('8');
    expect(r('data')).toBe('0x1234');
  });

  it('shows a whole struct as JSON, amounts included', () => {
    expect(JSON.parse(r('desc')!)).toEqual({
      srcToken: TOKEN,
      dstToken: RECIPIENT,
      amount: '1500000',
    });
  });

  it('reads @. paths from the transaction, never from the arguments', () => {
    expect(r('@.from')).toBe('0xsigner');
    expect(r('@.to')).toBe('0xrouter');
    expect(r('@.value')).toBe('0');
    expect(r('@.chainId')).toBe('10');
    expect(r('@.executor')).toBeNull();
  });

  it('returns null for what the arguments do not hold', () => {
    expect(r('')).toBeNull();
    expect(r('missing')).toBeNull();
    expect(r('desc.missing')).toBeNull();
    expect(r('$.metadata.constants.max')).toBeNull();
    expect(r('constructor')).toBeNull();
    expect(buildArgsPathResolver({})('@.to')).toBeNull();
  });
});

describe('resolveEip712FieldValue', () => {
  const msg = {
    spender: '0xspender',
    details: {
      amount: '1000',
      token: '0xtoken',
    },
    items: [{ name: 'foo' }, { name: 'bar' }],
  };

  it('resolves top-level keys', () => {
    expect(resolveEip712FieldValue('spender', msg)).toBe('0xspender');
  });

  it('resolves nested dot paths', () => {
    expect(resolveEip712FieldValue('details.amount', msg)).toBe('1000');
    expect(resolveEip712FieldValue('details.token', msg)).toBe('0xtoken');
  });

  it('resolves indexed array paths', () => {
    expect(resolveEip712FieldValue('items[0].name', msg)).toBe('foo');
    expect(resolveEip712FieldValue('items[1].name', msg)).toBe('bar');
  });

  it('treats [] as first item', () => {
    expect(resolveEip712FieldValue('items[].name', msg)).toBe('foo');
  });

  it('returns null for missing paths', () => {
    expect(resolveEip712FieldValue('missing', msg)).toBeNull();
    expect(resolveEip712FieldValue('details.missing', msg)).toBeNull();
    expect(resolveEip712FieldValue('items[99].name', msg)).toBeNull();
  });

  it('reads #. paths from the message', () => {
    expect(resolveEip712FieldValue('#.details.amount', msg)).toBe('1000');
  });

  it('reads @. paths from the container, not the message', () => {
    const container = { to: '0xverifying', value: '0', chainId: 1 };
    expect(resolveEip712FieldValue('@.to', msg, container)).toBe('0xverifying');
    expect(resolveEip712FieldValue('@.value', msg, container)).toBe('0');
    expect(resolveEip712FieldValue('@.spender', msg, container)).toBeNull();
    expect(resolveEip712FieldValue('@.from', msg, container)).toBeNull();
  });

  it('returns null for $. paths', () => {
    expect(resolveEip712FieldValue('$.metadata.enums.x', msg)).toBeNull();
  });

  it('returns null for malformed or mismatched array access', () => {
    expect(resolveEip712FieldValue('items[0', msg)).toBeNull();
    expect(resolveEip712FieldValue('items[x].name', msg)).toBeNull();
    expect(resolveEip712FieldValue('spender[0]', msg)).toBeNull();
    expect(resolveEip712FieldValue('spender[]', msg)).toBeNull();
    expect(resolveEip712FieldValue('items[[0]]', msg)).toBeNull();
    expect(resolveEip712FieldValue('spender.length', msg)).toBeNull();
    expect(resolveEip712FieldValue('', msg)).toBeNull();
  });

  it('returns nested objects as JSON', () => {
    expect(resolveEip712FieldValue('details', msg)).toBe(
      JSON.stringify(msg.details),
    );
  });

  it('handles primitive values', () => {
    expect(resolveEip712FieldValue('x', { x: 42 })).toBe('42');
    expect(resolveEip712FieldValue('x', { x: true })).toBe('true');
  });
});
