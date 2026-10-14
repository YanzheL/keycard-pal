import {
  BUNDLED_SOURCE_TEXT,
  descriptorSource,
} from '../src/utils/eip7730/source';

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
