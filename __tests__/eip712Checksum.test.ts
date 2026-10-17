import { hashTypedData } from 'viem';

import {
  checksumEip712Addresses,
  parseEip712Summary,
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
      return result.request.signData;
    };
    expect(sign(mail(BOB_MISCASED))).toBe(sign(mail(BOB.toLowerCase())));
  });
});
