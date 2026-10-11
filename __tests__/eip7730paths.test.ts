import {
  buildCalldataPathResolver,
  resolveEip712FieldValue,
} from '../src/utils/eip7730/paths';

import type { DecodedCall } from '../src/utils/txParser';

describe('buildCalldataPathResolver', () => {
  it('resolves erc20-transfer fields by canonical name', () => {
    const call: DecodedCall = {
      kind: 'erc20-transfer',
      to: '0xaaaa',
      amount: 123n,
    };
    const r = buildCalldataPathResolver(call);
    expect(r('to')).toBe('0xaaaa');
    expect(r('amount')).toBe('123');
    expect(r('_value')).toBe('123');
  });

  it('resolves erc20-transferFrom fields', () => {
    const call: DecodedCall = {
      kind: 'erc20-transferFrom',
      from: '0xfrom',
      to: '0xto',
      amount: 9n,
    };
    const r = buildCalldataPathResolver(call);
    expect(r('_from')).toBe('0xfrom');
    expect(r('to')).toBe('0xto');
    expect(r('value')).toBe('9');
    expect(r('spender')).toBeNull();
  });

  it('returns null for names a token call does not have', () => {
    expect(
      buildCalldataPathResolver({
        kind: 'erc20-transfer',
        to: '0x',
        amount: 1n,
      })('spender'),
    ).toBeNull();
    expect(
      buildCalldataPathResolver({
        kind: 'erc20-approve',
        spender: '0x',
        amount: 1n,
      })('to'),
    ).toBeNull();
  });

  it('returns null for calls without named fields and for an empty path', () => {
    const unknown: DecodedCall = {
      kind: 'unknown-call',
      selector: '0x12345678',
    };
    expect(buildCalldataPathResolver(unknown)('to')).toBeNull();
    expect(
      buildCalldataPathResolver({
        kind: 'erc20-transfer',
        to: '0x',
        amount: 1n,
      })(''),
    ).toBeNull();
  });

  it('resolves contract-call args by name', () => {
    const call: DecodedCall = {
      kind: 'contract-call',
      selector: '0xdeadbeef',
      functionName: 'doStuff',
      signature: 'doStuff(address)',
      args: [{ name: 'target', type: 'address', value: '0xbeef' }],
    };
    const r = buildCalldataPathResolver(call);
    expect(r('target')).toBe('0xbeef');
    expect(r('other')).toBeNull();
  });

  it('reads #. paths from the call', () => {
    const call: DecodedCall = {
      kind: 'erc20-approve',
      spender: '0xccc',
      amount: 7n,
    };
    const r = buildCalldataPathResolver(call);
    expect(r('#.spender')).toBe('0xccc');
    expect(r('#.amount')).toBe('7');
  });

  describe('@. paths read the transaction, not the call', () => {
    const call: DecodedCall = {
      kind: 'erc20-transfer',
      to: '0xrecipient',
      amount: 5n,
    };
    const r = buildCalldataPathResolver(call, {
      from: '0xsigner',
      to: '0xtoken',
      value: '0',
      chainId: 10,
    });

    it('resolves every container value', () => {
      expect(r('@.from')).toBe('0xsigner');
      expect(r('@.to')).toBe('0xtoken');
      expect(r('@.value')).toBe('0');
      expect(r('@.chainId')).toBe('10');
    });

    it('does not fall through to the call arguments', () => {
      expect(r('to')).toBe('0xrecipient');
      expect(r('@.amount')).toBeNull();
    });

    it('returns null for container values it was not given', () => {
      expect(buildCalldataPathResolver(call)('@.to')).toBeNull();
      expect(buildCalldataPathResolver(call)('@.chainId')).toBeNull();
    });
  });

  it('returns null for $. paths into the descriptor', () => {
    const call: DecodedCall = {
      kind: 'contract-call',
      selector: '0xdeadbeef',
      functionName: 'doStuff',
      signature: 'doStuff(address)',
      args: [{ name: 'metadata', type: 'address', value: '0xbeef' }],
    };
    expect(
      buildCalldataPathResolver(call)('$.metadata.constants.max'),
    ).toBeNull();
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
