import { rfc3339 } from '../src/utils/rfc3339';

afterEach(() => jest.restoreAllMocks());

// Minutes behind UTC, as Date reports them: Belgrade in winter is -60.
const at = (minutesBehindUtc: number, ms: number) => {
  jest
    .spyOn(Date.prototype, 'getTimezoneOffset')
    .mockReturnValue(minutesBehindUtc);
  return rfc3339(ms);
};

describe('rfc3339', () => {
  it('writes UTC with a Z and other zones with their offset', () => {
    const ms = Date.UTC(2027, 0, 15, 8, 0, 0);
    expect(at(0, ms)).toBe('2027-01-15 08:00:00Z');
    expect(at(-60, ms)).toBe('2027-01-15 09:00:00+01:00');
    expect(at(210, ms)).toBe('2027-01-15 04:30:00-03:30');
  });

  it('gives null for what it cannot write', () => {
    expect(rfc3339(Number.NaN)).toBeNull();
    expect(at(0, Date.UTC(10000, 0, 1))).toBeNull();
  });
});
