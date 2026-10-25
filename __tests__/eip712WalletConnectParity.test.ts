import { hashTypedData } from 'viem';

import { classifyEthPayload } from '../src/utils/ethPayload';
import { wcRequestToScanResult } from '../src/utils/walletConnect/requestAdapter';

const SIGNER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

const MAIL = {
  domain: {
    name: 'Mail',
    version: '1',
    chainId: 1,
    verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
  },
  types: {
    EIP712Domain: [
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' },
    ],
    Mail: [{ name: 'contents', type: 'string' }],
  },
  primaryType: 'Mail',
  message: { contents: 'Hello' },
};

function overQr(typedData: object) {
  return classifyEthPayload(
    Buffer.from(JSON.stringify(typedData), 'utf8').toString('hex'),
    2,
    1,
  );
}

function overWalletConnect(typedData: object) {
  const scan = wcRequestToScanResult(
    {
      id: 1,
      topic: 'topic',
      method: 'eth_signTypedData_v4',
      params: [SIGNER, JSON.stringify(typedData)],
    },
    new Map([[SIGNER.toLowerCase(), "m/44'/60'/0'/0/0"]]),
  );
  if (scan.kind !== 'eth-sign-request') throw new Error(scan.kind);
  const { signData, dataType, chainId } = scan.request;
  return classifyEthPayload(signData, dataType, chainId);
}

describe('the same typed data over WalletConnect and over QR', () => {
  it('signs the same digest', () => {
    const qr = overQr(MAIL);
    expect(qr.kind).toBe('eip712-json');
    expect(overWalletConnect(MAIL)).toEqual(qr);
  });

  it('signs under a declared EIP712Domain that differs from the derived one', () => {
    const reordered = {
      ...MAIL,
      types: {
        ...MAIL.types,
        EIP712Domain: [...MAIL.types.EIP712Domain].reverse(),
      },
    };
    const qr = overQr(reordered);
    expect(overWalletConnect(reordered)).toEqual(qr);
    if (qr.kind !== 'eip712-json') throw new Error(qr.kind);
    expect(qr.digest).toBe(
      hashTypedData(reordered as Parameters<typeof hashTypedData>[0]),
    );
    expect(qr.digest).not.toBe(
      hashTypedData({
        ...MAIL,
        types: { Mail: MAIL.types.Mail },
      } as Parameters<typeof hashTypedData>[0]),
    );
  });

  it('refuses it alike when it names no primaryType', () => {
    const unnamed = {
      domain: MAIL.domain,
      types: MAIL.types,
      message: MAIL.message,
    };
    const qr = overQr(unnamed);
    expect(qr).toEqual({
      kind: 'invalid',
      reason: 'EIP-712 typed data names no primaryType.',
    });
    expect(overWalletConnect(unnamed)).toEqual(qr);
  });

  it('refuses it alike when the signature would not cover a domain field', () => {
    const uncovered = {
      ...MAIL,
      types: {
        ...MAIL.types,
        EIP712Domain: MAIL.types.EIP712Domain.filter(f => f.name !== 'chainId'),
      },
    };
    const qr = overQr(uncovered);
    expect(qr).toEqual({
      kind: 'invalid',
      reason:
        'The EIP-712 domain has fields the signature would not cover: chainId.',
    });
    expect(overWalletConnect(uncovered)).toEqual(qr);
  });
});
