jest.mock('../src/data/eip7730.json', () =>
  require('./eip7730Index.testUtils').testIndex({
    generatedAt: '2024-01-01T00:00:00.000Z',
    contracts: {
      '1:0x000000000000000000000000000000000000beef': {
        '0xa9059cbb': {
          intent: 'Bundled transfer',
          fields: [{ path: 'to', label: 'To', format: 'addressName' }],
        },
      },
    },
    eip712: {
      '1:0x0000000000000000000000000000000000000777': {
        'Permit(address owner)': {
          intent: 'Bundled permit',
          fields: [],
        },
        'Bound(uint256 x)': {
          intent: 'Bound to a domain',
          fields: [],
          domain: { name: 'Permit2', chainId: '1' },
        },
      },
    },
  }),
);

const mockLoadSlice = jest.fn();
jest.mock('../src/storage/eip7730Index', () => ({
  loadSlice: (...args: any[]) => mockLoadSlice(...args),
}));

import {
  getSavedIndex,
  lookupCalldata,
  lookupEip712,
  setSavedIndex,
  subscribeSavedIndex,
  type FormatLookup,
} from '../src/utils/eip7730/lookup';
import { sliceIndex } from '../src/utils/eip7730/zip';

import { testIndex } from './eip7730Index.testUtils';

const BEEF = '0x000000000000000000000000000000000000beef';
const VERIFYING = '0x0000000000000000000000000000000000000777';

const SAVED = testIndex({
  contracts: {
    [`1:${BEEF}`]: { '0xa9059cbb': { intent: 'Saved transfer', fields: [] } },
  },
  eip712: {
    [`1:${VERIFYING}`]: {
      'Bound(uint256 x)': {
        intent: 'Saved bound',
        fields: [],
        domain: { name: 'Permit2' },
      },
    },
  },
});
const savedSlices = sliceIndex(SAVED);

function now(result: FormatLookup) {
  if (result instanceof Promise) throw new Error('expected an answer at once');
  return result;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadSlice.mockImplementation(
    async (name: string) => savedSlices.get(name) ?? null,
  );
});

afterEach(() => setSavedIndex(null));

describe('the bundled index', () => {
  it('finds calldata entry by lowercased address + selector', () => {
    const entry = now(
      lookupCalldata(
        1,
        '0x000000000000000000000000000000000000BEEF',
        '0xA9059CBB',
      ),
    );
    expect(entry?.intent).toBe('Bundled transfer');
  });

  it('returns null for an unknown chain, address or selector', () => {
    expect(now(lookupCalldata(137, BEEF, '0xa9059cbb'))).toBeNull();
    expect(
      now(
        lookupCalldata(
          1,
          '0x000000000000000000000000000000000000dead',
          '0xa9059cbb',
        ),
      ),
    ).toBeNull();
    expect(now(lookupCalldata(1, BEEF, '0xdeadbeef'))).toBeNull();
  });

  it('finds an EIP-712 descriptor by chain, verifying contract and encoded type', () => {
    expect(
      now(lookupEip712(1, VERIFYING, 'Permit(address owner)', {}))?.intent,
    ).toBe('Bundled permit');
  });

  it('does not match the bare primary type or an unknown encoded type', () => {
    expect(now(lookupEip712(1, VERIFYING, 'Permit', {}))).toBeNull();
    expect(now(lookupEip712(1, VERIFYING, 'Other(uint256 y)', {}))).toBeNull();
  });

  describe('domain binding', () => {
    it('matches when the message domain carries every required value', () => {
      expect(
        now(
          lookupEip712(1, VERIFYING, 'Bound(uint256 x)', {
            name: 'Permit2',
            chainId: 1,
            version: '1',
          }),
        )?.intent,
      ).toBe('Bound to a domain');
    });

    it('rejects a different or a missing value', () => {
      expect(
        now(
          lookupEip712(1, VERIFYING, 'Bound(uint256 x)', {
            name: 'Fake',
            chainId: 1,
          }),
        ),
      ).toBeNull();
      expect(
        now(lookupEip712(1, VERIFYING, 'Bound(uint256 x)', { chainId: 1 })),
      ).toBeNull();
    });
  });

  it('returns null for invalid input', () => {
    expect(lookupCalldata(NaN, '0xabc', '0xdef')).toBeNull();
    expect(lookupCalldata(1, '', '0xdef')).toBeNull();
    expect(lookupCalldata(1, '0xabc', '')).toBeNull();
    expect(lookupEip712(NaN, '0xabc', 'Permit(address owner)', {})).toBeNull();
    expect(lookupEip712(1, '', 'Permit(address owner)', {})).toBeNull();
    expect(lookupEip712(1, VERIFYING, '', {})).toBeNull();
  });
});

describe('a saved index', () => {
  beforeEach(() => setSavedIndex({ generatedAt: '2026-10-12T00:00:00.000Z' }));

  it('reads the slice for the address, then answers from it at once', async () => {
    const first = lookupCalldata(1, BEEF, '0xa9059cbb');
    expect(first).toBeInstanceOf(Promise);
    expect((await first)?.intent).toBe('Saved transfer');
    expect(mockLoadSlice).toHaveBeenCalledWith('00');

    expect(now(lookupCalldata(1, BEEF, '0xa9059cbb'))?.intent).toBe(
      'Saved transfer',
    );
    expect(mockLoadSlice).toHaveBeenCalledTimes(1);
  });

  it('reads a slice once while two lookups wait on it', async () => {
    const [a, b] = await Promise.all([
      lookupCalldata(1, BEEF, '0xa9059cbb'),
      lookupEip712(1, VERIFYING, 'Bound(uint256 x)', { name: 'Permit2' }),
    ]);
    expect(a?.intent).toBe('Saved transfer');
    expect(b?.intent).toBe('Saved bound');
    expect(mockLoadSlice).toHaveBeenCalledTimes(1);
  });

  it('replaces the bundled index entirely', async () => {
    expect(
      await lookupEip712(1, VERIFYING, 'Permit(address owner)', {}),
    ).toBeNull();
  });

  it('checks the domain on a saved format too', async () => {
    expect(
      await lookupEip712(1, VERIFYING, 'Bound(uint256 x)', { name: 'Fake' }),
    ).toBeNull();
  });

  it('remembers a slice that does not exist', async () => {
    const address = '0x1100000000000000000000000000000000000001';
    expect(await lookupCalldata(1, address, '0xa9059cbb')).toBeNull();
    expect(now(lookupCalldata(1, address, '0xa9059cbb'))).toBeNull();
    expect(mockLoadSlice).toHaveBeenCalledWith('11');
  });

  it('does not keep a slice read for a source replaced meanwhile', async () => {
    let finish: (slice: unknown) => void = () => {};
    mockLoadSlice.mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      }),
    );
    const pending = lookupCalldata(1, BEEF, '0xa9059cbb');
    setSavedIndex({ generatedAt: '2026-10-13T00:00:00.000Z' });
    finish(savedSlices.get('00'));
    await pending;

    expect(lookupCalldata(1, BEEF, '0xa9059cbb')).toBeInstanceOf(Promise);
    expect(mockLoadSlice).toHaveBeenCalledTimes(2);
  });

  it('goes back to the bundled index when cleared', () => {
    setSavedIndex(null);
    expect(now(lookupCalldata(1, BEEF, '0xa9059cbb'))?.intent).toBe(
      'Bundled transfer',
    );
  });
});

describe('the saved index store', () => {
  it('tells subscribers when the source changes, until they leave', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSavedIndex(listener);
    const saved = { generatedAt: '2026-10-12T00:00:00.000Z' };
    setSavedIndex(saved);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSavedIndex()).toBe(saved);
    unsubscribe();
    setSavedIndex(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSavedIndex()).toBeNull();
  });
});
