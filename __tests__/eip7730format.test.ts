import { UNLIMITED_APPROVAL_WARNING } from '../src/constants/approval';
import {
  asAddress,
  formatEip7730Field,
  interpolateIntent,
  UNKNOWN_TOKEN_WARNING,
} from '../src/utils/eip7730/format';
import { buildArgsEachResolver } from '../src/utils/eip7730/paths';

import type {
  Eip7730DisplayFormat,
  Eip7730Field,
} from '../src/utils/eip7730/zip';

jest.mock('../src/utils/tokenMetadata', () => ({
  lookupToken: jest.fn(),
}));

const { lookupToken } = jest.requireMock('../src/utils/tokenMetadata') as {
  lookupToken: jest.Mock;
};

const TOKEN = '0x000000000000000000000000000000000000feed';
const CONTRACT = '0x000000000000000000000000000000000000c0de';
const OTHER = '0x000000000000000000000000000000000000beef';
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const FORMAT: Eip7730DisplayFormat = {
  fields: [],
  metadata: {
    tokens: { [TOKEN]: { decimals: 6, ticker: 'USDC' } },
    enums: { orderType: { '0': 'BUY', '1': 'SELL' } },
  },
};

function field(
  format: Eip7730Field['format'],
  params?: Record<string, unknown>,
): Eip7730Field {
  return { path: 'v', label: 'V', format, params };
}

function ctx(
  paths: Record<string, string> = {},
  extra: { chainId?: number; contractAddress?: string } = { chainId: 1 },
) {
  return { ...extra, resolvePath: (p: string) => paths[p] ?? null };
}

beforeEach(() => {
  jest.clearAllMocks();
  lookupToken.mockReturnValue(null);
});

describe('formatEip7730Field', () => {
  it('passes raw, calldata and addressName values through', () => {
    for (const format of ['raw', 'calldata', 'addressName'] as const) {
      expect(formatEip7730Field(field(format), '0xabc', FORMAT, ctx())).toEqual(
        { text: '0xabc' },
      );
    }
  });

  it('shows a placeholder for a value that did not resolve', () => {
    expect(formatEip7730Field(field('raw'), null, FORMAT, ctx())).toEqual({
      text: '—',
    });
  });

  it('formats a unix timestamp as a date', () => {
    const { text } = formatEip7730Field(
      field('date'),
      '1700000000',
      FORMAT,
      ctx(),
    );
    expect(text).toMatch(/\d/);
    expect(text).not.toBe('1700000000');
  });

  it('keeps a timestamp past any date, such as a deadline that never expires', () => {
    for (const value of [
      (2n ** 256n - 1n).toString(),
      (2n ** 48n - 1n).toString(),
    ]) {
      expect(formatEip7730Field(field('date'), value, FORMAT, ctx()).text).toBe(
        value,
      );
    }
  });

  it('keeps a value that is not a timestamp', () => {
    for (const value of ['0', 'soon', '-5']) {
      expect(formatEip7730Field(field('date'), value, FORMAT, ctx()).text).toBe(
        value,
      );
    }
  });

  describe('enum', () => {
    const f = field('enum', { $ref: '$.metadata.enums.orderType' });

    it('resolves the $.metadata.enums path', () => {
      expect(formatEip7730Field(f, '0', FORMAT, ctx()).text).toBe('BUY');
      expect(formatEip7730Field(f, '1', FORMAT, ctx()).text).toBe('SELL');
    });

    it('keeps a value the enum does not list', () => {
      expect(formatEip7730Field(f, '5', FORMAT, ctx()).text).toBe('5');
    });

    it('finds a decimal key from the hex a slice gives', () => {
      expect(formatEip7730Field(f, '0x01', FORMAT, ctx()).text).toBe('SELL');
      expect(formatEip7730Field(f, '0x05', FORMAT, ctx()).text).toBe('0x05');
      expect(formatEip7730Field(f, 'x', FORMAT, ctx()).text).toBe('x');
    });

    it('keeps the value without a $ref', () => {
      expect(formatEip7730Field(field('enum'), '0', FORMAT, ctx()).text).toBe(
        '0',
      );
    });
  });

  describe('tokenAmount', () => {
    it('takes the token from tokenPath', () => {
      expect(
        formatEip7730Field(
          field('tokenAmount', { tokenPath: 'token' }),
          '1500000',
          FORMAT,
          ctx({ token: TOKEN }),
        ),
      ).toEqual({ text: '1.5 USDC' });
    });

    it('takes a fixed token address from token', () => {
      expect(
        formatEip7730Field(
          field('tokenAmount', { token: TOKEN }),
          '1500000',
          FORMAT,
          ctx(),
        ),
      ).toEqual({ text: '1.5 USDC' });
    });

    it('warns instead of using the called contract when no token is named', () => {
      expect(
        formatEip7730Field(
          field('tokenAmount'),
          '1500000',
          FORMAT,
          ctx({}, { chainId: 1, contractAddress: TOKEN }),
        ),
      ).toEqual({ text: '1500000', warnings: [UNKNOWN_TOKEN_WARNING] });
    });

    it('warns on a token constant it cannot resolve yet', () => {
      expect(
        formatEip7730Field(
          field('tokenAmount', { token: '$.metadata.constants.usdc' }),
          '1500000',
          FORMAT,
          ctx(),
        ),
      ).toEqual({ text: '1500000', warnings: [UNKNOWN_TOKEN_WARNING] });
    });

    it('applies `*` metadata to the described contract only', () => {
      const own: Eip7730DisplayFormat = {
        fields: [],
        metadata: { tokens: { '*': { decimals: 6, ticker: 'USDT' } } },
      };
      const f = field('tokenAmount', { tokenPath: 'token' });
      const extra = { chainId: 1, contractAddress: CONTRACT };
      expect(
        formatEip7730Field(f, '1500000', own, ctx({ token: CONTRACT }, extra)),
      ).toEqual({ text: '1.5 USDT' });
      expect(
        formatEip7730Field(f, '1500000', own, ctx({ token: OTHER }, extra)),
      ).toEqual({
        text: '1500000',
        warnings: [UNKNOWN_TOKEN_WARNING],
        unknownTokenAddress: OTHER,
      });
    });

    it('names the address of a token it does not know', () => {
      expect(
        formatEip7730Field(
          field('tokenAmount', { tokenPath: 'token' }),
          '1500000',
          { fields: [] },
          ctx({ token: OTHER.toUpperCase().replace('0X', '0x') }),
        ),
      ).toEqual({
        text: '1500000',
        warnings: [UNKNOWN_TOKEN_WARNING],
        unknownTokenAddress: OTHER,
      });
    });

    it('falls back to the bundled token list', () => {
      lookupToken.mockReturnValue({ symbol: 'DAI', decimals: 18 });
      expect(
        formatEip7730Field(
          field('tokenAmount', { token: OTHER }),
          '1000000000000000000',
          { fields: [] },
          ctx(),
        ),
      ).toEqual({ text: '1 DAI' });
      expect(lookupToken).toHaveBeenCalledWith(1, OTHER);
    });

    it('reads a native currency address as the chain currency', () => {
      for (const nativeCurrencyAddress of [NATIVE, [OTHER, NATIVE]]) {
        expect(
          formatEip7730Field(
            field('tokenAmount', { tokenPath: 'token', nativeCurrencyAddress }),
            '2000000000000000',
            FORMAT,
            ctx({ token: NATIVE }),
          ),
        ).toEqual({ text: '0.002 ETH' });
      }
    });

    it('ignores native currency constants it cannot resolve yet', () => {
      expect(
        formatEip7730Field(
          field('tokenAmount', {
            tokenPath: 'token',
            nativeCurrencyAddress: ['$.metadata.constants.addressAsEth'],
          }),
          '2000000000000000',
          FORMAT,
          ctx({ token: NATIVE }),
        ),
      ).toEqual({
        text: '2000000000000000',
        warnings: [UNKNOWN_TOKEN_WARNING],
        unknownTokenAddress: NATIVE,
      });
    });

    describe('threshold', () => {
      const threshold =
        '0x8000000000000000000000000000000000000000000000000000000000000000';
      const f = field('tokenAmount', { token: TOKEN, threshold });

      const unlimited = {
        text: 'Unlimited USDC',
        warnings: [UNLIMITED_APPROVAL_WARNING],
      };

      it('shows "Unlimited" with the ticker and the approval warning at the threshold', () => {
        expect(formatEip7730Field(f, threshold, FORMAT, ctx())).toEqual(
          unlimited,
        );
      });

      it('shows "Unlimited" above the threshold', () => {
        expect(
          formatEip7730Field(f, (2n ** 256n - 1n).toString(), FORMAT, ctx()),
        ).toEqual(unlimited);
      });

      it('warns on "Any amount" too', () => {
        expect(
          formatEip7730Field(
            field('tokenAmount', {
              token: TOKEN,
              threshold,
              message: 'Any amount',
            }),
            threshold,
            FORMAT,
            ctx(),
          ),
        ).toEqual({
          text: 'Any amount USDC',
          warnings: [UNLIMITED_APPROVAL_WARNING],
        });
      });

      it.each(['All', 'Max'])(
        'does not warn on "%s", the user\'s own funds',
        message => {
          expect(
            formatEip7730Field(
              field('tokenAmount', { token: TOKEN, threshold, message }),
              threshold,
              FORMAT,
              ctx(),
            ),
          ).toEqual({ text: `${message} USDC` });
        },
      );

      it('shows the amount below the threshold', () => {
        expect(formatEip7730Field(f, '1500000', FORMAT, ctx())).toEqual({
          text: '1.5 USDC',
        });
      });

      it('still warns when the token is unknown', () => {
        expect(
          formatEip7730Field(
            field('tokenAmount', { threshold }),
            threshold,
            FORMAT,
            ctx(),
          ),
        ).toEqual({
          text: 'Unlimited',
          warnings: [UNLIMITED_APPROVAL_WARNING, UNKNOWN_TOKEN_WARNING],
        });
      });

      it('names the unknown token at the threshold too', () => {
        expect(
          formatEip7730Field(
            field('tokenAmount', { token: OTHER, threshold }),
            threshold,
            FORMAT,
            ctx(),
          ),
        ).toEqual({
          text: 'Unlimited',
          warnings: [UNLIMITED_APPROVAL_WARNING, UNKNOWN_TOKEN_WARNING],
          unknownTokenAddress: OTHER,
        });
      });

      it('ignores a threshold constant it cannot resolve yet', () => {
        expect(
          formatEip7730Field(
            field('tokenAmount', {
              token: TOKEN,
              threshold: '$.metadata.constants.max',
            }),
            '1500000',
            FORMAT,
            ctx(),
          ),
        ).toEqual({ text: '1.5 USDC' });
      });
    });

    it('passes a non-numeric value through', () => {
      expect(
        formatEip7730Field(
          field('tokenAmount', { token: TOKEN }),
          'abc',
          FORMAT,
          ctx(),
        ),
      ).toEqual({ text: 'abc' });
    });
  });

  describe('amount', () => {
    it('formats wei in the chain currency', () => {
      expect(
        formatEip7730Field(field('amount'), '2000000000000000', FORMAT, ctx()),
      ).toEqual({ text: '0.002 ETH' });
      expect(
        formatEip7730Field(
          field('amount'),
          '1000000000000000000',
          FORMAT,
          ctx({}, { chainId: 137 }),
        ),
      ).toEqual({ text: '1 POL' });
    });

    it('shows "All" at the threshold', () => {
      expect(
        formatEip7730Field(
          field('amount', { threshold: '0x10' }),
          '16',
          FORMAT,
          ctx(),
        ),
      ).toEqual({ text: 'All' });
    });

    it('uses the descriptor message', () => {
      expect(
        formatEip7730Field(
          field('amount', { threshold: '0x10', message: 'Everything' }),
          '17',
          FORMAT,
          ctx(),
        ),
      ).toEqual({ text: 'Everything' });
    });

    it('keeps the raw value without a chain', () => {
      expect(
        formatEip7730Field(field('amount'), '2000', FORMAT, ctx({}, {})),
      ).toEqual({ text: '2000' });
    });
  });
});

describe('asAddress', () => {
  const ADDRESS = '0xD3CDa913deb6F4967B2eF3Aa68F5a843da74c4Ef';

  it('checksums an address', () => {
    expect(asAddress(ADDRESS.toLowerCase())).toBe(ADDRESS);
  });

  it('takes the last 20 bytes of a 32-byte word, in hex or decimal', () => {
    const packed = 0x80n * 2n ** 248n + BigInt(ADDRESS);
    expect(asAddress(`0x${packed.toString(16)}`)).toBe(ADDRESS);
    expect(asAddress(packed.toString())).toBe(ADDRESS);
  });

  it('gives null for anything else', () => {
    expect(asAddress('0x1234')).toBeNull();
    expect(asAddress((2n ** 256n).toString())).toBeNull();
    expect(asAddress('vitalik.eth')).toBeNull();
  });
});

describe('interpolateIntent', () => {
  const RECIPIENT = '0xd3cda913deb6f4967b2ef3aa68f5a843da74c4ef';
  const sentence = (
    interpolatedIntent: string | undefined,
    paths: Record<string, string> = { '#.amount': '1500000', to: RECIPIENT },
  ) =>
    interpolateIntent(
      {
        intent: 'Send',
        interpolatedIntent,
        fields: [
          { path: 'to', label: 'To', format: 'addressName' },
          {
            path: '#.amount',
            label: 'Amount',
            format: 'tokenAmount',
            params: { token: TOKEN },
          },
          { path: '@.value', label: 'Value', format: 'amount' },
          { path: '', label: 'Ticker', format: 'raw', value: 'kmmUSDC' },
          { path: 'data', label: 'Call', format: 'calldata' },
        ],
        metadata: FORMAT.metadata,
      },
      ctx({ ...paths, '@.value': '500000000000000000' }),
    );

  it('formats each placeholder as its field, addresses checksummed', () => {
    expect(sentence('Send {amount} to {#.to}')).toBe(
      'Send 1.5 USDC to 0xD3CDa913deb6F4967B2eF3Aa68F5a843da74c4Ef',
    );
    expect(sentence('Wrap {@.value}')).toBe('Wrap 0.5 ETH');
    expect(sentence('Run {{f}} for {amount}')).toBe('Run {f} for 1.5 USDC');
  });

  it('gives no sentence, so the intent shows, when anything cannot be filled', () => {
    expect(sentence(undefined)).toBeNull();
    expect(sentence('Send {amount} to {to}', { '#.amount': '1' })).toBeNull();
    expect(sentence('Send {missing}')).toBeNull();
    expect(sentence('Call {data}', { data: '0x12' })).toBeNull();
    expect(sentence('Broken {amount')).toBeNull();
  });
  it('fills an array placeholder with every element, each paired with its token', () => {
    const OTHER_TOKEN = '0x000000000000000000000000000000000000f00d';
    const args = {
      amounts: [1500000n, 2000000n],
      tokens: [TOKEN, OTHER_TOKEN],
      owners: [
        '0xd3cda913deb6f4967b2ef3aa68f5a843da74c4ef',
        '0x000000000000000000000000000000000000c0de',
      ],
    };
    const resolveEach = buildArgsEachResolver(args);
    const fmt = (interpolatedIntent: string) => ({
      intent: 'Withdraw',
      interpolatedIntent,
      fields: [
        {
          path: 'amounts.[]',
          label: 'Amount',
          format: 'tokenAmount' as const,
          params: { tokenPath: 'tokens.[]' },
        },
        { path: 'owners.[]', label: 'Owner', format: 'addressName' as const },
      ],
      metadata: {
        tokens: {
          [TOKEN]: { decimals: 6, ticker: 'USDC' },
          [OTHER_TOKEN]: { decimals: 6, ticker: 'DAI' },
        },
      },
    });
    const context = {
      chainId: 1,
      resolvePath: (p: string) => resolveEach(p)[0] ?? null,
      resolveEach,
    };
    expect(interpolateIntent(fmt('Withdraw {amounts.[]}'), context)).toBe(
      'Withdraw 1.5 USDC, 2 DAI',
    );
    expect(interpolateIntent(fmt('For {owners.[]}'), context)).toBe(
      'For 0xD3CDa913deb6F4967B2eF3Aa68F5a843da74c4Ef, 0x000000000000000000000000000000000000c0DE',
    );
    expect(
      interpolateIntent(fmt('Withdraw {amounts.[]}'), {
        ...context,
        resolveEach: buildArgsEachResolver({ amounts: [] }),
      }),
    ).toBeNull();
  });
});
