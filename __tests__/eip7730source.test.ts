import {
  BUNDLED_SOURCE_TEXT,
  descriptorReview,
  descriptorSource,
  NOT_REVIEWED_TEXT,
  reviewerNames,
} from '../src/utils/eip7730/source';

const CYFRIN = '0x3846c3A30E62075Fa916216b35EF04B8F53931f6';

afterEach(() => jest.restoreAllMocks());

describe('descriptorSource', () => {
  it('names the bundled registry when nothing is saved', () => {
    expect(descriptorSource(null)).toBe(BUNDLED_SOURCE_TEXT);
  });

  it('says how a saved registry arrived, on the local day it did', () => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(-120);
    const generatedAt = '2026-10-13T23:30:00.000Z';
    expect(descriptorSource({ generatedAt, source: 'import' })).toBe(
      'From a registry imported on 2026-10-14',
    );
    expect(descriptorSource({ generatedAt, source: 'download' })).toBe(
      'From a registry downloaded on 2026-10-14',
    );
  });

  it('still names a registry saved before the source was kept, or without a readable date', () => {
    jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(0);
    expect(descriptorSource({ generatedAt: '2026-10-13T08:00:00.000Z' })).toBe(
      'From a registry added on 2026-10-13',
    );
    expect(descriptorSource({ generatedAt: 'soon', source: 'import' })).toBe(
      'From a registry imported',
    );
  });
});

describe('descriptorReview', () => {
  it('names a trusted attester once, however often it is listed', () => {
    expect(descriptorReview([CYFRIN, CYFRIN])).toBe('Reviewed by Cyfrin');
  });

  it('counts only attesters the app still trusts', () => {
    const other = '0x00000000000000000000000000000000000000aa';
    expect(reviewerNames([other])).toEqual([]);
    expect(descriptorReview([other])).toBe(NOT_REVIEWED_TEXT);
    expect(descriptorReview(undefined)).toBe(NOT_REVIEWED_TEXT);
  });
});
