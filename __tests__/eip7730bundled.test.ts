// Real descriptors and no mocks, so a change to the bundled data or its parsing fails here.
import { encodeEip712Type } from '../src/utils/eip712';
import { formatEip7730Field } from '../src/utils/eip7730/format';
import { lookupCalldata, lookupEip712 } from '../src/utils/eip7730/lookup';
import {
  buildCalldataPathResolver,
  resolveEip712FieldValue,
  type Eip7730Container,
} from '../src/utils/eip7730/paths';
import type { Eip7730DisplayFormat } from '../src/utils/eip7730/zip';
import { decodeCalldata } from '../src/utils/txParser';

const USDT = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const AAVE_V2_POOL = '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9';
const ONEINCH_V5 = '0x1111111254eeb25477b68fb85ed929f73a960582';
const RECIPIENT = '0xd3cda913deb6f4967b2ef3aa68f5a843da74c4ef';
const AMOUNT = 1_500_000n;

const word = (v: string | bigint) =>
  typeof v === 'string'
    ? v.slice(2).padStart(64, '0')
    : v.toString(16).padStart(64, '0');

function renderCalldata(to: string, data: string): Record<string, string> {
  const call = decodeCalldata(data);
  expect(call).not.toBeNull();
  const descriptor = lookupCalldata(1, to, data.slice(0, 10));
  expect(descriptor).not.toBeNull();
  const container: Eip7730Container = { to, value: '0', chainId: 1 };
  const ctx = {
    chainId: 1,
    contractAddress: to,
    resolvePath: buildCalldataPathResolver(call!, container),
  };
  return rows(descriptor!, ctx);
}

function rows(
  descriptor: Eip7730DisplayFormat,
  ctx: Parameters<typeof formatEip7730Field>[3],
): Record<string, string> {
  return Object.fromEntries([
    ['intent', descriptor.intent ?? ''],
    ...descriptor.fields.map(f => [
      f.label,
      formatEip7730Field(f, ctx.resolvePath(f.path), descriptor, ctx).text,
    ]),
  ]);
}

describe('bundled EIP-7730 descriptors', () => {
  it('USDT transfer', () => {
    const out = renderCalldata(
      USDT,
      `0xa9059cbb${word(RECIPIENT)}${word(AMOUNT)}`,
    );
    expect(out.intent).toBe('Send');
    expect(out.Amount).toBe('1.5 USDT');
    expect(out.To.toLowerCase()).toBe(RECIPIENT);
  });

  it('USDT unlimited approval reads "Unlimited USDT"', () => {
    const out = renderCalldata(
      USDT,
      `0x095ea7b3${word(ONEINCH_V5)}${word(2n ** 256n - 1n)}`,
    );
    expect(out.intent).toBe('Approve');
    expect(out.Amount).toBe('Unlimited USDT');
  });

  it('Aave v2 borrow resolves the token argument and the rate enum', () => {
    const out = renderCalldata(
      AAVE_V2_POOL,
      `0xa415bcad${word(USDT)}${word(AMOUNT)}${word(2n)}${word(0n)}${word(
        RECIPIENT,
      )}`,
    );
    expect(out.intent).toBe('Borrow');
    expect(out['Amount to borrow']).toBe('1.5 USDT');
    expect(out['Interest Rate mode']).toBe('variable');
  });

  it('Kiln vault: formats come through two includes, with constants and a fixed value', () => {
    const vault = '0x2a4e2dacc45186bed96d9f766cb6be6b0f8a26f1';
    const descriptor = lookupCalldata(1, vault, '0x6e553f65');
    expect(descriptor?.intent).toBe('Deposit');
    const call = {
      kind: 'contract-call' as const,
      selector: '0x6e553f65',
      functionName: 'deposit',
      signature: 'deposit(uint256,address)',
      args: [
        { name: 'assets', type: 'uint256', value: AMOUNT.toString() },
        { name: 'receiver', type: 'address', value: RECIPIENT },
      ],
    };
    const out = rows(descriptor!, {
      chainId: 1,
      contractAddress: vault,
      resolvePath: buildCalldataPathResolver(call, { to: vault, chainId: 1 }),
    });
    expect(out['Deposit asset']).toBe('1.5 USDC');
    expect(
      descriptor!.fields.find(f => f.label === 'Share ticker')?.value,
    ).toBe('kmmUSDC');
  });

  it('1inch v4 on BSC exists only through an include, its constants resolved', () => {
    const swap = lookupCalldata(
      56,
      '0x1111111254fb6c44bac0bed2854e76f90643097d',
      '0xbc80f1a8',
    );
    expect(swap?.intent).toBe('Swap');
    expect(JSON.stringify(swap)).not.toContain('$.metadata.constants');
    expect(swap!.fields[0].params?.nativeCurrencyAddress).toContain(
      '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    );
  });

  describe('USDC TransferWithAuthorization', () => {
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };
    const domain = {
      name: 'USD Coin',
      version: '2',
      chainId: 1,
      verifyingContract: USDC,
    };
    const message = {
      from: RECIPIENT,
      to: ONEINCH_V5,
      value: AMOUNT.toString(),
      validAfter: '0',
      validBefore: '1800000000',
      nonce: `0x${'11'.repeat(32)}`,
    };
    const encodedType = encodeEip712Type('TransferWithAuthorization', types)!;

    it('matches by encoded type and renders the amount', () => {
      const descriptor = lookupEip712(1, USDC, encodedType, domain);
      expect(descriptor?.intent).toBe('Authorize USDC transfer');
      const container = { to: USDC, value: '0', chainId: 1 };
      const out = rows(descriptor!, {
        chainId: 1,
        contractAddress: USDC,
        resolvePath: path => resolveEip712FieldValue(path, message, container),
      });
      expect(out.Amount).toBe('1.5 USDC');
    });

    it('does not match a message from another domain', () => {
      expect(
        lookupEip712(1, USDC, encodedType, { ...domain, name: 'Fake Coin' }),
      ).toBeNull();
    });
  });
});
