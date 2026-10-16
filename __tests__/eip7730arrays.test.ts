import {
  arrayIndices,
  bindField,
  firstArraySelector,
} from '../src/utils/eip7730/arrays';
import { buildArgsEachResolver } from '../src/utils/eip7730/paths';
import type { Eip7730Field } from '../src/utils/eip7730/zip';

const each = buildArgsEachResolver({
  details: [{ amount: 1n }, { amount: 2n }, { amount: 3n }],
  empty: [],
  packed: 5n,
});

describe('firstArraySelector', () => {
  it('finds the first selector that can take several elements', () => {
    expect(firstArraySelector('#.details.[].amount')).toEqual({
      prefix: 'details.[]',
      base: 'details.',
    });
    expect(firstArraySelector('a.[0].b.[*].c')).toEqual({
      prefix: 'a.[0].b.[*]',
      base: 'a.[0].b.',
    });
    expect(firstArraySelector('pools.[1:]')).toEqual({
      prefix: 'pools.[1:]',
      base: 'pools.',
      slice: ['1', undefined],
    });
  });

  it('finds none in a path of names and single indices', () => {
    expect(firstArraySelector('details.[0].amount')).toBeNull();
    expect(firstArraySelector('pools.[-1]')).toBeNull();
    expect(firstArraySelector('@.to')).toBeNull();
  });
});

describe('arrayIndices', () => {
  it('takes every index of `[]`, none of an empty array', () => {
    expect(
      arrayIndices(firstArraySelector('details.[]')!, { resolveEach: each }),
    ).toEqual([0, 1, 2]);
    expect(
      arrayIndices(firstArraySelector('empty.[]')!, { resolveEach: each }),
    ).toEqual([]);
  });

  it('takes the indices an array slice covers', () => {
    expect(
      arrayIndices(firstArraySelector('details.[1:]')!, { resolveEach: each }),
    ).toEqual([1, 2]);
    expect(
      arrayIndices(firstArraySelector('details.[-2:-1]')!, {
        resolveEach: each,
      }),
    ).toEqual([1]);
  });

  it('gives null for a slice of bytes or without an each-resolver', () => {
    expect(
      arrayIndices(firstArraySelector('packed.[-20:]')!, { resolveEach: each }),
    ).toBeNull();
    expect(arrayIndices(firstArraySelector('details.[]')!, {})).toBeNull();
  });
});

describe('bindField', () => {
  const field: Eip7730Field = {
    path: '#.details.[].amount',
    label: 'Amount',
    format: 'tokenAmount',
    params: {
      tokenPath: 'details.[].token',
      threshold: '0xff',
      nativeCurrencyAddress: ['0xeee'],
    },
  };

  it('points the field and its params over the same array at one element', () => {
    expect(bindField(field, firstArraySelector(field.path)!, 2)).toEqual({
      ...field,
      path: 'details.[2].amount',
      params: {
        tokenPath: 'details.[2].token',
        threshold: '0xff',
        nativeCurrencyAddress: ['0xeee'],
      },
    });
  });

  it('pairs a param path over another array by position, and leaves other params alone', () => {
    const other = {
      ...field,
      params: {
        tokenPath: 'tokens.[]',
        message: 'Any [] text',
        calleePath: 'to',
      },
    };
    expect(bindField(other, firstArraySelector(field.path)!, 1).params).toEqual(
      {
        tokenPath: 'tokens.[1]',
        message: 'Any [] text',
        calleePath: 'to',
      },
    );
  });

  it('pairs a sliced param with the element by position in each selection', () => {
    const bound = (
      path: string,
      tokenPath: string,
      args: Record<string, unknown>,
    ) => {
      const f: Eip7730Field = {
        path,
        label: 'Amount',
        format: 'tokenAmount',
        params: { tokenPath },
      };
      const resolveEach = buildArgsEachResolver(args);
      const indices = arrayIndices(firstArraySelector(path)!, { resolveEach })!;
      return indices.map((_, n) => {
        const b = bindField(f, firstArraySelector(path)!, n, { resolveEach });
        return [b.path, b.params?.tokenPath];
      });
    };
    const tokens = ['USDC', 'USDT', 'DAI', 'WETH'];
    expect(
      bound('amounts.[1:]', 'tokens.[1:]', {
        amounts: [1n, 2n, 3n, 4n],
        tokens,
      }),
    ).toEqual([
      ['amounts.[1]', 'tokens.[1]'],
      ['amounts.[2]', 'tokens.[2]'],
      ['amounts.[3]', 'tokens.[3]'],
    ]);
    expect(
      bound('amounts.[]', 'tokens.[1:]', { amounts: [1n, 2n, 3n], tokens }),
    ).toEqual([
      ['amounts.[0]', 'tokens.[1]'],
      ['amounts.[1]', 'tokens.[2]'],
      ['amounts.[2]', 'tokens.[3]'],
    ]);
  });

  it('leaves a param that slices bytes as one value', () => {
    const f: Eip7730Field = {
      path: 'details.[].amount',
      label: 'Amount',
      format: 'tokenAmount',
      params: { tokenPath: 'packed.[-20:]' },
    };
    expect(
      bindField(f, firstArraySelector(f.path)!, 1, { resolveEach: each })
        .params,
    ).toEqual({ tokenPath: 'packed.[-20:]' });
  });

  it('binds nested arrays one level at a time', () => {
    const nested: Eip7730Field = {
      path: 'swaps.[].route.[].amount',
      label: 'Amount',
      format: 'raw',
      params: { tokenPath: 'swaps.[].route.[].token' },
    };
    const outer = bindField(nested, firstArraySelector(nested.path)!, 1);
    expect(outer.path).toBe('swaps.[1].route.[].amount');
    expect(outer.params).toEqual({ tokenPath: 'swaps.[1].route.[].token' });
    const inner = bindField(outer, firstArraySelector(outer.path)!, 0);
    expect(inner.path).toBe('swaps.[1].route.[0].amount');
    expect(inner.params).toEqual({ tokenPath: 'swaps.[1].route.[0].token' });
  });
});
