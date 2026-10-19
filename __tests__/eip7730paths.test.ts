import { encodeFunctionData, parseAbiItem, type AbiFunction } from 'viem';

import {
  buildArgsEachResolver,
  buildArgsPathResolver,
  buildEip712Resolvers,
  decodeArgsBySignature,
  resolveEip712FieldValue,
  resolveEip712FieldValues,
  sliceRange,
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

describe('every value a path selects', () => {
  const args = {
    calls: [
      { to: '0xaa', data: '0x01', value: 1n },
      { to: '0xbb', data: '0x02', value: 2n },
    ],
    data: ['0x0a', '0x0b', '0x0c'],
  };
  const each = buildArgsEachResolver(args, { to: '0xrouter' });

  it('takes each element of `[]` and `[*]`, in order', () => {
    expect(each('data.[]')).toEqual(['0x0a', '0x0b', '0x0c']);
    expect(each('data[*]')).toEqual(['0x0a', '0x0b', '0x0c']);
    expect(each('calls.[].to')).toEqual(['0xaa', '0xbb']);
    expect(each('#.calls.[].value')).toEqual(['1', '2']);
  });

  it('takes one element by index, negative from the end, and nothing past either end', () => {
    expect(each('data[1]')).toEqual(['0x0b']);
    expect(each('data[9]')).toEqual([]);
    expect(each('data.[-1]')).toEqual(['0x0c']);
    expect(each('data.[-3]')).toEqual(['0x0a']);
    expect(each('data.[-4]')).toEqual([]);
    expect(each('calls.[-1].to')).toEqual(['0xbb']);
  });

  it('takes a slice of an array as its elements', () => {
    expect(each('data.[1:]')).toEqual(['0x0b', '0x0c']);
    expect(each('data.[:-1]')).toEqual(['0x0a', '0x0b']);
    expect(each('data.[-2:]')).toEqual(['0x0b', '0x0c']);
    expect(each('data.[2:1]')).toEqual([]);
  });

  it('does not index into a value that is not an array', () => {
    expect(each('calls.[0].data.[0]')).toEqual([]);
    expect(each('calls.[0].to.[]')).toEqual([]);
  });

  it('reads a container value once, and nothing it does not hold', () => {
    expect(each('@.to')).toEqual(['0xrouter']);
    expect(each('@.from')).toEqual([]);
    expect(each('$.metadata.constants.x')).toEqual([]);
    expect(each('')).toEqual([]);
    expect(each('calls.[].missing')).toEqual([]);
  });

  it('walks an EIP-712 message the same way', () => {
    const message = { calls: [{ data: '0x01' }, { data: '0x02' }] };
    expect(resolveEip712FieldValues('calls.[].data', message)).toEqual([
      '0x01',
      '0x02',
    ]);
    expect(resolveEip712FieldValue('calls.[].data', message)).toBe('0x01');
  });
});

describe('slices of a value', () => {
  const word = (hex: string) => `0x${hex.padStart(64, '0')}`;
  const args = {
    packed: 0xabn * 2n ** 248n + BigInt(RECIPIENT),
    negative: -1n,
    path: `0x${'11'.repeat(20)}000bb8${'22'.repeat(20)}`,
    creds: `0x01${'00'.repeat(11)}${'33'.repeat(20)}`,
    flag: true,
    text: 'hello',
  };
  const r = buildArgsPathResolver(args);

  it('slices a number as its 32-byte word', () => {
    expect(r('packed.[-20:]')).toBe(RECIPIENT.toLowerCase());
    expect(r('packed.[:1]')).toBe('0xab');
    expect(r('packed.[0:32]')).toBe(
      word(args.packed.toString(16)).toLowerCase(),
    );
    expect(r('negative.[-1:]')).toBe('0xff');
  });

  it('slices bytes as they are', () => {
    expect(r('path.[0:20]')).toBe(`0x${'11'.repeat(20)}`);
    expect(r('path.[-20:]')).toBe(`0x${'22'.repeat(20)}`);
    expect(r('creds.[:1]')).toBe('0x01');
    expect(r('creds.[12:32]')).toBe(`0x${'33'.repeat(20)}`);
  });

  it('gives nothing for an empty slice or a value with no bytes', () => {
    expect(r('creds.[40:]')).toBeNull();
    expect(r('flag.[:1]')).toBeNull();
  });

  it('slices a string over its UTF-8 bytes and gives text back', () => {
    const s = buildArgsPathResolver({ word: 'hello', euro: 'a€b' });
    expect(s('word.[:2]')).toBe('he');
    expect(s('word.[-3:]')).toBe('llo');
    expect(s('euro.[1:4]')).toBe('€');
    // Half a character has no text, so its bytes show.
    expect(s('euro.[1:3]')).toBe('0xe282');
  });

  it('slices an EIP-712 number given as decimal or hex text', () => {
    const message = { deadline: '1800000000', small: '0x0', id: 255 };
    expect(resolveEip712FieldValue('deadline.[-4:]', message)).toBe(
      '0x6b49d200',
    );
    expect(resolveEip712FieldValue('small.[-1:]', message)).toBe('0x00');
    expect(resolveEip712FieldValue('id.[-1:]', message)).toBe('0xff');
  });

  it('counts slice bounds like Python, clamped to the length', () => {
    expect(sliceRange(10, undefined, undefined)).toEqual([0, 10]);
    expect(sliceRange(10, '-3', undefined)).toEqual([7, 10]);
    expect(sliceRange(10, '2', '-2')).toEqual([2, 8]);
    expect(sliceRange(10, '-20', '99')).toEqual([0, 10]);
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

describe('buildEip712Resolvers', () => {
  const lower = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
  const typed = {
    primaryType: 'Batch',
    types: {
      Batch: [
        { name: 'tokens', type: 'address[]' },
        { name: 'memo', type: 'string' },
        { name: 'raw', type: 'bytes32' },
      ],
    },
    message: {
      tokens: [lower, lower],
      memo: lower,
      raw: `0x${'00'.repeat(12)}${lower.slice(2)}`,
    },
  };
  const { resolvePath, resolveEach } = buildEip712Resolvers(typed, {
    to: lower,
  });

  it('writes address fields in ERC-55, one value or each', () => {
    expect(resolvePath('tokens.[0]')).toBe(TOKEN);
    expect(resolveEach('tokens.[]')).toEqual([TOKEN, TOKEN]);
  });

  it('leaves strings, bytes and slices as the message wrote them', () => {
    expect(resolvePath('memo')).toBe(lower);
    expect(resolvePath('raw.[-20:]')).toBe(lower);
  });

  it('checksums the container addresses too', () => {
    expect(resolvePath('@.to')).toBe(TOKEN);
  });
});

describe('buildEip712Resolvers: miscasedAt', () => {
  // Mixed case, not the EIP-55 form of TOKEN.
  const MISCASED = '0xa0B86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
  const { miscasedAt } = buildEip712Resolvers(
    {
      primaryType: 'Order',
      types: {
        Order: [
          { name: 'maker', type: 'address' },
          { name: 'takers', type: 'address[]' },
          { name: 'note', type: 'string' },
          { name: 'inner', type: 'Inner' },
          { name: 'lower', type: 'address' },
        ],
        Inner: [{ name: 'who', type: 'address' }],
      },
      message: {
        maker: MISCASED,
        takers: [TOKEN, MISCASED],
        note: MISCASED,
        inner: { who: MISCASED },
        lower: TOKEN.toLowerCase(),
      },
    },
    { to: MISCASED },
  );

  it('names a declared address the request wrote with a wrong checksum', () => {
    expect(miscasedAt('maker')).toBe(true);
    expect(miscasedAt('inner.who')).toBe(true);
    expect(miscasedAt('takers.[1]')).toBe(true);
    expect(miscasedAt('takers.[]')).toBe(true);
  });

  it('leaves out a good checksum, lower case, a string and the container', () => {
    expect(miscasedAt('takers.[0]')).toBe(false);
    expect(miscasedAt('lower')).toBe(false);
    expect(miscasedAt('note')).toBe(false);
    expect(miscasedAt('@.to')).toBe(false);
  });
});

describe('numbers in an EIP-712 message', () => {
  it('reads a large integer as its digits, not exponent notation', () => {
    expect(resolveEip712FieldValues('n', { n: 1e21 })).toEqual([
      '1000000000000000000000',
    ]);
    expect(resolveEip712FieldValues('n', { n: 42 })).toEqual(['42']);
    expect(resolveEip712FieldValues('n', { n: 1.5 })).toEqual(['1.5']);
  });
});

describe('a call with no arguments', () => {
  it('decodes despite a stray byte after its selector', () => {
    expect(decodeArgsBySignature('deposit()', '0xd0e30db076')).toEqual({});
    expect(decodeArgsBySignature('deposit()', '0xd0e30db0')).toEqual({});
    expect(decodeArgsBySignature('deposit()', '0x12345678')).toBeNull();
  });

  it('refuses data that is not whole bytes, which would decode shifted', () => {
    const transfer =
      '0xa9059cbb000000000000000000000000dac17f958d2ee523a2206206994597c13d831ec7000000000000000000000000000000000000000000000000000000000000007b';
    const sig = 'transfer(address to,uint256 value)';
    expect(decodeArgsBySignature(sig, transfer)).not.toBeNull();
    expect(decodeArgsBySignature(sig, transfer.slice(0, -1))).toBeNull();
    expect(decodeArgsBySignature(sig, `${transfer.slice(0, -2)}zz`)).toBeNull();
  });
});
