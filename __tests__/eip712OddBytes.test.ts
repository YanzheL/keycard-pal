import { hashTypedData } from 'viem';

import {
  oddLengthBytesPath,
  type Eip712RawTypedData,
} from '../src/utils/eip712';
import { classifyEthPayload } from '../src/utils/ethPayload';
import { wcRequestToScanResult } from '../src/utils/walletConnect/requestAdapter';

// ERC-20 transfer(0xd8dA…6045, 1_000_000), and the same with its last hex digit dropped.
const TRANSFER =
  '0xa9059cbb000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa9604500000000000000000000000000000000000000000000000000000000000f4240';
const TRANSFER_ODD = TRANSFER.slice(0, -1);

const SAFE_TX_TYPES = {
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
};

function safeTx(data: string, withPrimaryType = true) {
  return {
    types: SAFE_TX_TYPES,
    ...(withPrimaryType ? { primaryType: 'SafeTx' } : {}),
    domain: {
      chainId: 1,
      verifyingContract: '0x3333333333333333333333333333333333333333',
    },
    message: {
      to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      value: '0',
      data,
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    },
  };
}

const typedSafeTx = (data: string) => ({
  ...safeTx(data),
  primaryType: 'SafeTx',
});

function hex(payload: unknown): string {
  return '0x' + Buffer.from(JSON.stringify(payload), 'utf8').toString('hex');
}

describe('oddLengthBytesPath', () => {
  const typed = (
    types: Record<string, unknown>,
    message: Record<string, unknown>,
    domain: Record<string, unknown> = {},
  ) => ({ types, primaryType: 'M', domain, message });

  it('names a bytes value with an odd number of hex digits', () => {
    expect(oddLengthBytesPath(typedSafeTx(TRANSFER_ODD))).toBe('message.data');
  });

  it('names a bytesN value, inside arrays and structs too', () => {
    expect(
      oddLengthBytesPath(
        typed(
          {
            M: [{ name: 'items', type: 'Item[]' }],
            Item: [{ name: 'hash', type: 'bytes32' }],
          },
          {
            items: [
              { hash: '0x' + 'ab'.repeat(32) },
              { hash: '0x' + 'ab'.repeat(31) + 'a' },
            ],
          },
        ),
      ),
    ).toBe('message.items.[1].hash');
  });

  it("names the domain's salt", () => {
    expect(
      oddLengthBytesPath(
        typed({ M: [] }, {}, { name: 'X', salt: '0x' + '1'.repeat(63) }),
      ),
    ).toBe('domain.salt');
  });

  it('passes what does not fit its declared type', () => {
    expect(
      oddLengthBytesPath(
        typed({ M: [{ name: 'list', type: 'bytes[]' }] }, { list: '0xabc' }),
      ),
    ).toBeNull();
    expect(
      oddLengthBytesPath({
        types: { M: [] },
        primaryType: 'M',
        domain: 'X',
        message: null,
      } as unknown as Eip712RawTypedData),
    ).toBeNull();
  });

  it('passes whole bytes, empty bytes, and what is not hex at all', () => {
    expect(oddLengthBytesPath(typedSafeTx(TRANSFER))).toBeNull();
    expect(oddLengthBytesPath(typedSafeTx('0x'))).toBeNull();
    expect(
      oddLengthBytesPath(
        typed({ M: [{ name: 'b', type: 'bytes' }] }, { b: 'not hex' }),
      ),
    ).toBeNull();
  });
});

describe('a message with odd-length bytes', () => {
  it('cannot be signed, and the review says which value', () => {
    const payload = classifyEthPayload(hex(safeTx(TRANSFER_ODD)), 2);
    expect(payload).toEqual({
      kind: 'invalid',
      reason:
        'EIP-712 value message.data has an odd number of hex digits, so it is not whole bytes.',
    });
  });

  it('signs as before once the bytes are whole', () => {
    const payload = classifyEthPayload(hex(safeTx(TRANSFER)), 2);
    expect(payload.kind).toBe('eip712-json');
  });
});

describe('a WalletConnect request with odd-length bytes', () => {
  const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const scan = (payload: unknown) => {
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
    return result.request;
  };

  it('reaches the review as typed data, which refuses it', () => {
    const request = scan(safeTx(TRANSFER_ODD));
    expect(request.dataType).toBe(2);
    expect(request.reviewData).toBe(request.signData);
    expect(
      classifyEthPayload(request.signData, request.dataType),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('keeps the primary type it resolved, so the review reads the same message', () => {
    const request = scan(safeTx(TRANSFER_ODD, false));
    expect(
      classifyEthPayload(request.signData, request.dataType),
    ).toMatchObject({
      kind: 'invalid',
      reason: expect.stringContaining('message.data'),
    });
  });

  it('still hashes a message whose bytes are whole', () => {
    const request = scan(safeTx(TRANSFER));
    expect(request.dataType).toBe(0);
    const { SafeTx } = SAFE_TX_TYPES;
    expect(request.signData).toBe(
      hashTypedData({ ...safeTx(TRANSFER), types: { SafeTx } } as Parameters<
        typeof hashTypedData
      >[0]),
    );
  });
});
