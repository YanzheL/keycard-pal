import { UNLIMITED_APPROVAL_WARNING } from '../src/constants/approval';
import {
  formatEip7730Field,
  UNKNOWN_TOKEN_WARNING,
} from '../src/utils/eip7730/format';

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

  describe('enum', () => {
    const f = field('enum', { $ref: '$.metadata.enums.orderType' });

    it('resolves the $.metadata.enums path', () => {
      expect(formatEip7730Field(f, '0', FORMAT, ctx()).text).toBe('BUY');
      expect(formatEip7730Field(f, '1', FORMAT, ctx()).text).toBe('SELL');
    });

    it('keeps a value the enum does not list', () => {
      expect(formatEip7730Field(f, '5', FORMAT, ctx()).text).toBe('5');
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
      ).toEqual({ text: '1500000', warnings: [UNKNOWN_TOKEN_WARNING] });
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
