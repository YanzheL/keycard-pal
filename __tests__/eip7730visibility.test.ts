import {
  fitsRequest,
  isFieldShown,
  passesMustMatch,
  sameValue,
  shownFields,
} from '../src/utils/eip7730/visibility';
import type {
  Eip7730DisplayFormat,
  Eip7730Field,
} from '../src/utils/eip7730/zip';

const ADDRESS = '0xD3CDa913deb6F4967B2eF3Aa68F5a843da74c4Ef';

function source(values: Record<string, string | string[]>, withEach = true) {
  const list = (path: string) => {
    const value = values[path];
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  };
  return {
    resolvePath: (path: string) => list(path)[0] ?? null,
    ...(withEach ? { resolveEach: list } : {}),
  };
}

function field(path: string, visible?: Eip7730Field['visible']): Eip7730Field {
  return { path, label: path, format: 'raw', ...(visible ? { visible } : {}) };
}

function format(...fields: Eip7730Field[]): Eip7730DisplayFormat {
  return { fields };
}

describe('sameValue', () => {
  it('compares integers by value, in decimal or hex', () => {
    expect(sameValue('0', '0')).toBe(true);
    expect(sameValue('0x0', '0')).toBe(true);
    expect(sameValue('0x10', '16')).toBe(true);
    expect(sameValue('-1', '-1')).toBe(true);
    expect(sameValue('1', '2')).toBe(false);
  });

  it('compares hex without case', () => {
    expect(sameValue(ADDRESS, ADDRESS.toLowerCase())).toBe(true);
    expect(sameValue('0xAbCd', '0xabce')).toBe(false);
  });

  it('compares other text exactly', () => {
    expect(sameValue('true', 'true')).toBe(true);
    expect(sameValue('Buy', 'buy')).toBe(false);
  });

  it('never treats an empty value as zero', () => {
    expect(sameValue('', '0')).toBe(false);
    expect(sameValue(' ', '0')).toBe(false);
  });
});

describe('isFieldShown', () => {
  it('shows a field without a rule', () => {
    expect(isFieldShown(field('a'), source({ a: '0' }))).toBe(true);
  });

  it('hides a field whose value its ifNotIn list names', () => {
    const f = field('expiry', { ifNotIn: ['0'] });
    expect(isFieldShown(f, source({ expiry: '0' }))).toBe(false);
    expect(isFieldShown(f, source({ expiry: '0x00' }))).toBe(false);
    expect(isFieldShown(f, source({ expiry: '1700000000' }))).toBe(true);
  });

  it('shows an ifNotIn field whose value is missing', () => {
    const f = field('expiry', { ifNotIn: ['0'] });
    expect(isFieldShown(f, source({}))).toBe(true);
  });

  it("reads a constant field's own value", () => {
    const f = { ...field(''), value: '0', visible: { ifNotIn: ['0'] } };
    expect(isFieldShown(f, source({}))).toBe(false);
  });

  it('always hides a mustMatch field', () => {
    const f = field('op', { mustMatch: ['0'] });
    expect(isFieldShown(f, source({ op: '0' }))).toBe(false);
  });

  it('shownFields keeps the order of the fields it keeps', () => {
    const fmt = format(
      field('a'),
      field('b', { ifNotIn: ['0'] }),
      field('c', { mustMatch: ['1'] }),
      field('d'),
    );
    expect(
      shownFields(fmt, source({ a: '1', b: '0', c: '1', d: '2' })).map(
        f => f.path,
      ),
    ).toEqual(['a', 'd']);
  });
});

describe('passesMustMatch', () => {
  it('passes an entry without mustMatch fields', () => {
    expect(passesMustMatch(format(field('a')), source({}))).toBe(true);
  });

  it('passes when the value is listed and fails when it is not', () => {
    const fmt = format(field('op', { mustMatch: ['0', '1'] }));
    expect(passesMustMatch(fmt, source({ op: '1' }))).toBe(true);
    expect(passesMustMatch(fmt, source({ op: '2' }))).toBe(false);
  });

  it('fails when the value is missing', () => {
    const fmt = format(field('op', { mustMatch: ['0'] }));
    expect(passesMustMatch(fmt, source({}))).toBe(false);
  });

  it('fails an empty list', () => {
    const fmt = format(field('op', { mustMatch: [] }));
    expect(passesMustMatch(fmt, source({ op: '0' }))).toBe(false);
  });

  it('checks every element an array path selects', () => {
    const fmt = format(field('calls.[].op', { mustMatch: ['0'] }));
    expect(passesMustMatch(fmt, source({ 'calls.[].op': ['0', '0'] }))).toBe(
      true,
    );
    expect(passesMustMatch(fmt, source({ 'calls.[].op': ['0', '1'] }))).toBe(
      false,
    );
  });

  it('reads the single value without an each-resolver', () => {
    const fmt = format(field('op', { mustMatch: ['0'] }));
    expect(passesMustMatch(fmt, source({ op: '0' }, false))).toBe(true);
    expect(passesMustMatch(fmt, source({ op: '1' }, false))).toBe(false);
    expect(passesMustMatch(fmt, source({}, false))).toBe(false);
  });

  it("checks a constant field's own value", () => {
    const fmt = format({
      ...field(''),
      value: ADDRESS,
      visible: { mustMatch: [ADDRESS.toLowerCase()] },
    });
    expect(passesMustMatch(fmt, source({}))).toBe(true);
  });
});

describe('fitsRequest', () => {
  const bundled = { id: 0, iteration: 'bundled' as const };
  const lists = (tokens: string[], amounts: string[]) =>
    source({ 'tokens.[]': tokens, 'amounts.[]': amounts });

  it('fails a mustMatch value outside its list', () => {
    const fmt = format(field('op', { mustMatch: ['0'] }));
    expect(fitsRequest(fmt, source({ op: '1' }))).toBe(false);
    expect(fitsRequest(fmt, source({ op: '0' }))).toBe(true);
  });

  it('fails a bundled group whose arrays differ in length', () => {
    const fmt = format(
      { ...field('tokens.[]'), group: bundled },
      { ...field('amounts.[]'), group: bundled },
    );
    expect(fitsRequest(fmt, lists(['a', 'b'], ['1', '2']))).toBe(true);
    expect(fitsRequest(fmt, lists(['a', 'b'], ['1']))).toBe(false);
  });

  it('lets arrays outside a bundled group differ', () => {
    const fmt = format(field('tokens.[]'), field('amounts.[]'));
    expect(fitsRequest(fmt, lists(['a', 'b'], ['1']))).toBe(true);
  });

  it('fails a param over another array of a different length', () => {
    const fmt = format({
      ...field('amounts.[]'),
      params: { tokenPath: 'tokens.[]' },
    });
    expect(fitsRequest(fmt, lists(['a', 'b'], ['1', '2']))).toBe(true);
    expect(fitsRequest(fmt, lists(['a'], ['1', '2']))).toBe(false);
  });

  it('skips constants and fields over no array', () => {
    const fmt = format(
      { ...field(''), value: '1', group: bundled },
      { ...field('x'), group: bundled, params: { tokenPath: 'tokens.[]' } },
    );
    expect(fitsRequest(fmt, lists(['a'], []))).toBe(true);
  });
});
