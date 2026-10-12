// Real descriptors and no mocks, so a change to the bundled data or its parsing fails here.
import {
  encodeFunctionData,
  parseAbiItem,
  type AbiFunction,
  type AbiParameter,
} from 'viem';

import bundled from '../src/data/eip7730.json';
import { UNLIMITED_APPROVAL_WARNING } from '../src/constants/approval';
import { encodeEip712Type } from '../src/utils/eip712';
import { formatEip7730Field } from '../src/utils/eip7730/format';
import * as lookup from '../src/utils/eip7730/lookup';
import {
  buildArgsPathResolver,
  decodeArgsBySignature,
  resolveEip712FieldValue,
  type Eip7730Container,
} from '../src/utils/eip7730/paths';
import type {
  Eip7730DisplayFormat,
  Eip7730Index,
} from '../src/utils/eip7730/zip';

// The bundled index answers at once; a promise here would make every review screen wait.
function now(result: lookup.FormatLookup): Eip7730DisplayFormat | null {
  if (result instanceof Promise)
    throw new Error('bundled lookup returned a promise');
  return result;
}
const lookupCalldata = (...args: Parameters<typeof lookup.lookupCalldata>) =>
  now(lookup.lookupCalldata(...args));
const lookupEip712 = (...args: Parameters<typeof lookup.lookupEip712>) =>
  now(lookup.lookupEip712(...args));

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

// As the review does it: the entry's own signature decodes the calldata its paths refer to.
function renderCalldata(
  to: string,
  data: string,
  chainId = 1,
): Record<string, string> {
  const descriptor = lookupCalldata(chainId, to, data.slice(0, 10));
  expect(descriptor?.signature).toBeDefined();
  const args = decodeArgsBySignature(descriptor!.signature!, data);
  expect(args).not.toBeNull();
  const container: Eip7730Container = { to, value: '0', chainId };
  const ctx = {
    chainId,
    contractAddress: to,
    resolvePath: buildArgsPathResolver(args!, container),
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
    const descriptor = lookupCalldata(1, USDT, '0x095ea7b3')!;
    const amount = descriptor.fields.find(f => f.label === 'Amount')!;
    expect(
      formatEip7730Field(amount, (2n ** 256n - 1n).toString(), descriptor, {
        chainId: 1,
        contractAddress: USDT,
        resolvePath: () => USDT,
      }).warnings,
    ).toEqual([UNLIMITED_APPROVAL_WARNING]);
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
    const out = renderCalldata(
      vault,
      '0x6e553f65' + word(AMOUNT) + word(RECIPIENT),
    );
    expect(out['Deposit asset']).toBe('1.5 USDC');
    expect(out['Send shares to'].toLowerCase()).toBe(RECIPIENT);
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

// A value of any ABI type, so calldata can be built for every bundled signature.
function sample(param: AbiParameter): unknown {
  const array = param.type.match(/^(.*)\[(\d*)\]$/);
  if (array) {
    const inner = { ...param, type: array[1] } as AbiParameter;
    return Array.from({ length: Number(array[2] || 2) }, () => sample(inner));
  }
  if (param.type === 'tuple' && 'components' in param) {
    return Object.fromEntries(
      param.components.map((c, i) => [c.name || String(i), sample(c)]),
    );
  }
  if (param.type === 'address') return RECIPIENT;
  if (param.type === 'bool') return true;
  if (param.type === 'string') return 'x';
  if (param.type === 'bytes') return '0x1234';
  if (param.type.startsWith('bytes')) {
    return `0x${'11'.repeat(Number(param.type.slice(5)))}`;
  }
  return 1n;
}

describe('every bundled calldata descriptor', () => {
  const formats = (bundled as unknown as Eip7730Index).formats.filter(
    f => f.signature,
  );

  it('decodes calldata built for its own signature, and its paths resolve', () => {
    let paths = 0;
    for (const format of formats) {
      const item = parseAbiItem(`function ${format.signature}`) as AbiFunction;
      const data = encodeFunctionData({
        abi: [item],
        args: item.inputs.map(sample),
      });
      const args = decodeArgsBySignature(format.signature!, data);
      expect(args).not.toBeNull();
      const resolve = buildArgsPathResolver(args!, {
        from: RECIPIENT,
        to: USDT,
        value: '0',
        chainId: 1,
      });
      for (const field of format.fields) {
        // Slices and negative indices are not read yet; `$.` points into the descriptor.
        if (!field.path || field.path.startsWith('$.')) continue;
        if (/\[-|\[\d*:/.test(field.path)) continue;
        expect([format.signature, field.path, resolve(field.path)]).not.toEqual(
          [format.signature, field.path, null],
        );
        paths += 1;
      }
    }
    expect(formats.length).toBeGreaterThan(800);
    expect(paths).toBeGreaterThan(2000);
  });
});
