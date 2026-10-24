import { hashTypedData } from 'viem';

import {
  checksumEip712Addresses,
  parseEip712Summary,
  type Eip712RawTypedData,
} from '../src/utils/eip712';
import { classifyEthPayload } from '../src/utils/ethPayload';
import { wcRequestToScanResult } from '../src/utils/walletConnect/requestAdapter';

// EIP-55 test vectors.
const BOB = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const CAROL = '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359';
const DAVE = '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB';
const VERIFIER = '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb';
// Mixed case, not the EIP-55 form.
const BOB_MISCASED = '0x5aaeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

const TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Person: [
    { name: 'wallet', type: 'address' },
    { name: 'friends', type: 'address[]' },
  ],
  Mail: [
    { name: 'to', type: 'address' },
    { name: 'from', type: 'address' },
    { name: 'note', type: 'string' },
    { name: 'cc', type: 'Person' },
  ],
};

const TYPES_WITHOUT_DOMAIN = Object.fromEntries(
  Object.entries(TYPES).filter(([name]) => name !== 'EIP712Domain'),
);

function mail(to: string, from = CAROL.toLowerCase()) {
  return {
    types: TYPES,
    primaryType: 'Mail',
    domain: { name: 'Mail', chainId: 1, verifyingContract: VERIFIER },
    message: {
      to,
      from,
      note: BOB_MISCASED,
      cc: { wallet: DAVE.toLowerCase(), friends: [BOB_MISCASED, CAROL] },
    },
  };
}

function toHex(payload: unknown): string {
  return '0x' + Buffer.from(JSON.stringify(payload), 'utf8').toString('hex');
}

describe('checksumEip712Addresses', () => {
  it('writes every declared address in EIP-55 and names the rows with a wrong checksum', () => {
    const { typedData, miscased } = checksumEip712Addresses(mail(BOB_MISCASED));
    expect(typedData.message).toEqual({
      to: BOB,
      from: CAROL,
      note: BOB_MISCASED,
      cc: { wallet: DAVE, friends: [BOB, CAROL] },
    });
    expect(miscased.sort()).toEqual(['message.cc', 'message.to']);
  });

  it('flags neither all lower case nor all upper case', () => {
    const upper = '0x' + BOB.slice(2).toUpperCase();
    const { typedData, miscased } = checksumEip712Addresses({
      ...mail(BOB.toLowerCase(), upper),
      message: { to: BOB.toLowerCase(), from: upper },
    });
    expect(typedData.message).toEqual({ to: BOB, from: BOB });
    expect(miscased).toEqual([]);
  });

  it('keeps a string that looks like an address as written', () => {
    const { typedData } = checksumEip712Addresses(mail(BOB));
    expect(typedData.message.note).toBe(BOB_MISCASED);
  });

  it('takes the domain types viem infers when EIP712Domain is left out', () => {
    const { typedData, miscased } = checksumEip712Addresses({
      ...mail(BOB),
      types: TYPES_WITHOUT_DOMAIN,
      domain: { name: 'Mail', verifyingContract: BOB_MISCASED },
    });
    expect(typedData.domain.verifyingContract).toBe(BOB);
    expect(miscased).toContain('domain.verifyingContract');
  });

  it('leaves a value that does not fit its declared type as written', () => {
    const { typedData, miscased } = checksumEip712Addresses({
      types: {
        Bag: [
          { name: 'list', type: 'address[]' },
          { name: 'who', type: 'address' },
        ],
      },
      primaryType: 'Bag',
      domain: {},
      message: { list: BOB_MISCASED, who: 42 },
    });
    expect(typedData.message).toEqual({ list: BOB_MISCASED, who: 42 });
    expect(miscased).toEqual([]);
  });

  it('passes a domain or a message that is not an object through', () => {
    const { typedData } = checksumEip712Addresses({
      types: TYPES,
      primaryType: 'Mail',
      domain: 'Mail',
      message: null,
    } as unknown as Eip712RawTypedData);
    expect(typedData.domain).toBe('Mail');
    expect(typedData.message).toBeNull();
  });

  it('never sets a prototype from a member named __proto__', () => {
    const { typedData } = checksumEip712Addresses({
      types: { Evil: [{ name: '__proto__', type: 'address' }] },
      primaryType: 'Evil',
      domain: {},
      message: JSON.parse(`{"__proto__":"${BOB_MISCASED}"}`),
    });
    expect(Object.getPrototypeOf(typedData.message)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).toString).toBe(
      Object.prototype.toString,
    );
  });
});

describe('a message with a wrong checksum', () => {
  it('reviews with addresses in EIP-55 and names the rows', () => {
    const summary = parseEip712Summary(toHex(mail(BOB_MISCASED)));
    expect(summary).not.toBeNull();
    expect(summary!.message.to).toBe(BOB);
    expect(summary!.message.from).toBe(CAROL);
    expect(summary!.message.note).toBe(BOB_MISCASED);
    expect(summary!.miscasedAddresses.sort()).toEqual([
      'message.cc',
      'message.to',
    ]);
    expect(summary!.rawJson).toContain(BOB_MISCASED);
  });

  it('signs the digest of the same 20 bytes in lower case', () => {
    const payload = classifyEthPayload(toHex(mail(BOB_MISCASED)), 2);
    expect(payload.kind).toBe('eip712-json');
    const lower = mail(BOB.toLowerCase());
    lower.message.cc.friends = [BOB.toLowerCase(), CAROL.toLowerCase()];
    expect(payload.kind === 'eip712-json' && payload.digest).toBe(
      hashTypedData({ ...lower, types: TYPES_WITHOUT_DOMAIN } as Parameters<
        typeof hashTypedData
      >[0]),
    );
  });

  it('hashes the same over WalletConnect', () => {
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const sign = (payload: unknown) => {
      const result = wcRequestToScanResult(
        {
          id: 1,
          topic: 'topic',
          method: 'eth_signTypedData_v4',
          params: [addr, JSON.stringify(payload)],
        },
        new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/0"]]),
      );
      if (result.kind !== 'eth-sign-request') throw new Error(result.kind);
      const signed = classifyEthPayload(
        result.request.signData,
        result.request.dataType,
      );
      if (signed.kind !== 'eip712-json') throw new Error(signed.kind);
      return signed.digest;
    };
    expect(sign(mail(BOB_MISCASED))).toBe(sign(mail(BOB.toLowerCase())));
  });
});

describe("the app's Permit and SafeTx reviews", () => {
  const ZERO = '0x0000000000000000000000000000000000000000';
  const summaryOf = (payload: unknown) => parseEip712Summary(toHex(payload));

  it('Permit: names a mis-cased spender', () => {
    const summary = summaryOf({
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      domain: { name: 'Token', chainId: 1, verifyingContract: VERIFIER },
      message: {
        owner: CAROL,
        spender: BOB_MISCASED,
        value: '1',
        nonce: '0',
        deadline: '1',
      },
    });
    expect(summary!.special).toMatchObject({
      kind: 'permit',
      spender: BOB,
      miscased: ['spender'],
    });
  });

  it('PermitSingle: names a mis-cased token inside details', () => {
    const summary = summaryOf({
      types: {
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
          { name: 'expiration', type: 'uint48' },
          { name: 'nonce', type: 'uint48' },
        ],
        PermitSingle: [
          { name: 'details', type: 'PermitDetails' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
      },
      primaryType: 'PermitSingle',
      domain: { name: 'Permit2', chainId: 1, verifyingContract: VERIFIER },
      message: {
        details: {
          token: BOB_MISCASED,
          amount: '1',
          expiration: '1',
          nonce: '0',
        },
        spender: CAROL.toLowerCase(),
        sigDeadline: '1',
      },
    });
    expect(summary!.special).toMatchObject({
      kind: 'permit-single',
      tokenContract: BOB,
      spender: CAROL,
      miscased: ['tokenContract'],
    });
  });

  it('SafeTx: names a mis-cased Safe and refund receiver, not the zero address', () => {
    const summary = summaryOf({
      types: {
        EIP712Domain: [
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ],
        SafeTx: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'operation', type: 'uint8' },
          { name: 'safeTxGas', type: 'uint256' },
          { name: 'baseGas', type: 'uint256' },
          { name: 'gasPrice', type: 'uint256' },
          { name: 'gasToken', type: 'address' },
          { name: 'refundReceiver', type: 'address' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'SafeTx',
      domain: { chainId: 1, verifyingContract: BOB_MISCASED },
      message: {
        to: CAROL,
        value: '0',
        data: '0x',
        operation: 0,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: ZERO,
        refundReceiver: BOB_MISCASED,
        nonce: '0',
      },
    });
    expect(summary!.special).toMatchObject({
      kind: 'safe-tx',
      safeAddress: BOB,
      refundReceiver: BOB,
      miscased: ['safeAddress', 'refundReceiver'],
    });
  });
});
