import { classifyEthPayload } from '../src/utils/ethPayload';
import { wcRequestToScanResult } from '../src/utils/walletConnect/requestAdapter';
import type { WCRequest } from '../src/providers/walletConnect/context';

function makeReq(method: string, params: unknown[]): WCRequest {
  return { id: 1, topic: 'topic', method, params };
}

function expectEthSignResult(result: ReturnType<typeof wcRequestToScanResult>) {
  expect(result.kind).toBe('eth-sign-request');
  if (result.kind !== 'eth-sign-request') {
    throw new Error('Expected eth-sign-request');
  }
  return result;
}

describe('wcRequestToScanResult — personal_sign', () => {
  const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const addressToPath = new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/0"]]);

  it('standard order [message, address] → dataType=3', () => {
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('personal_sign', ['0xdeadbeef', addr]),
        addressToPath,
      ),
    );
    expect(result.request.dataType).toBe(3);
    expect(result.request.signData).toBe('0xdeadbeef');
    expect(result.request.address).toBe(addr);
  });

  it('reversed order [address, message] → still correct', () => {
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('personal_sign', [addr, '0xdeadbeef']),
        addressToPath,
      ),
    );
    expect(result.request.signData).toBe('0xdeadbeef');
    expect(result.request.address).toBe(addr);
  });

  it('hex-encodes plain UTF-8 message string', () => {
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('personal_sign', ['Hello Keycard Pal', addr]),
        addressToPath,
      ),
    );
    // "Hello Keycard Pal" → hex
    expect(result.request.signData).toMatch(/^0x[0-9a-f]+$/);
    expect(result.request.signData).not.toBe('0x'); // non-empty
  });

  it('preserves 0x-prefixed message as-is', () => {
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('personal_sign', ['0xabcd1234', addr]),
        addressToPath,
      ),
    );
    expect(result.request.signData).toBe('0xabcd1234');
  });

  it('sets derivationPath and origin', () => {
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('personal_sign', ['0xdeadbeef', addr]),
        addressToPath,
      ),
    );
    expect(result.request.derivationPath).toBe("m/44'/60'/0'/0/0");
    expect(result.request.origin).toBe('WalletConnect');
  });
});

describe('wcRequestToScanResult — eth_signTypedData_v4', () => {
  const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
  const validPayload = JSON.stringify({
    domain: { name: 'Test', version: '1', chainId: 1 },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
      ],
      Mail: [{ name: 'contents', type: 'string' }],
    },
    primaryType: 'Mail',
    message: { contents: 'hello' },
  });

  it('hands the JSON text over unchanged as dataType 2', () => {
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, validPayload]),
        new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/0"]]),
      ),
    );
    expect(result.request.dataType).toBe(2);
    expect(
      Buffer.from(result.request.signData.slice(2), 'hex').toString('utf8'),
    ).toBe(validPayload);
  });

  it('sets address and origin', () => {
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, validPayload]),
        new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/0"]]),
      ),
    );
    expect(result.request.address).toBe(addr);
    expect(result.request.origin).toBe('WalletConnect');
  });

  it('resolves derivation path from addressToPath map', () => {
    const map = new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/1"]]);
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, validPayload]),
        map,
      ),
    );
    expect(result.request.derivationPath).toBe("m/44'/60'/0'/0/1");
  });

  it('throws when no address map is provided', () => {
    expect(() =>
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, validPayload]),
      ),
    ).toThrow('Missing WalletConnect address mapping');
  });

  it('throws when address is not in the map', () => {
    const map = new Map<string, string>();
    expect(() =>
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, validPayload]),
        map,
      ),
    ).toThrow('not found in session');
  });

  it('throws when payload is not valid JSON', () => {
    expect(() =>
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, 'not-json']),
      ),
    ).toThrow('JSON parse failed');
  });

  // The classification would read a field that is not an object as empty.
  it.each([
    ['message is missing', { domain: {}, types: {} }],
    ['domain is a string', { domain: 'x', types: {}, message: {} }],
    ['types is an array', { domain: {}, types: [], message: {} }],
    ['message is a number', { domain: {}, types: {}, message: 1 }],
  ])('throws when %s', (_label, payload) => {
    expect(() =>
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, JSON.stringify(payload)]),
        new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/0"]]),
      ),
    ).toThrow('domain, types and message must be objects');
  });

  // As dataType 2, a pre-hash or a bare digest would be signed without a review.
  it.each([
    ['a pre-hashed payload', `0x1901${'aa'.repeat(32)}${'bb'.repeat(32)}`],
    ['a bare digest', `0x${'11'.repeat(32)}`],
    ['a JSON string', JSON.stringify(`0x${'11'.repeat(32)}`)],
    ['a JSON array', JSON.stringify([JSON.parse(validPayload)])],
  ])('refuses %s at entry', (_label, param) => {
    expect(() =>
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, param]),
        new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/0"]]),
      ),
    ).toThrow('Invalid EIP-712 payload');
  });

  it('hands typed data it cannot hash to the review, which refuses it', () => {
    const bad = JSON.stringify({
      domain: {},
      types: { Foo: [{ name: 'bar', type: 'NonExistentType' }] },
      primaryType: 'Foo',
      message: { bar: 'x' },
    });
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('eth_signTypedData_v4', [addr, bad]),
        new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/0"]]),
      ),
    );
    expect(
      classifyEthPayload(result.request.signData, result.request.dataType),
    ).toEqual({
      kind: 'invalid',
      reason: 'EIP-712 typed data could not be hashed.',
    });
  });
});

describe('wcRequestToScanResult — personal_sign path resolution', () => {
  it('resolves derivation path from addressToPath map', () => {
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const map = new Map([[addr.toLowerCase(), "m/44'/60'/0'/0/3"]]);
    const result = expectEthSignResult(
      wcRequestToScanResult(
        makeReq('personal_sign', ['0xdeadbeef', addr]),
        map,
      ),
    );
    expect(result.request.derivationPath).toBe("m/44'/60'/0'/0/3");
  });
});

describe('wcRequestToScanResult — unsupported methods', () => {
  it('throws for unknown method', () => {
    expect(() =>
      wcRequestToScanResult(makeReq('eth_sendTransaction', [{}])),
    ).toThrow('Unsupported method');
  });
});

describe('wcRequestToScanResult — invalid params', () => {
  it('throws when params array is too short', () => {
    expect(() =>
      wcRequestToScanResult(makeReq('personal_sign', ['only-one'])),
    ).toThrow('expected array of at least 2 strings');
  });

  it('throws when params contain non-string values', () => {
    expect(() =>
      wcRequestToScanResult(makeReq('personal_sign', [123, 456])),
    ).toThrow('expected strings');
  });

  it('throws when params do not contain a signer address', () => {
    expect(() =>
      wcRequestToScanResult(makeReq('personal_sign', ['message', 'payload'])),
    ).toThrow('signer address missing');
  });
});
