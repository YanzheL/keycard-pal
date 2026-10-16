// Its own file: the count only means something before anything else has built the index.
let mockBundledBuilds = 0;
jest.mock('../src/data/eip7730.json', () => {
  mockBundledBuilds += 1;
  return require('./eip7730Index.testUtils').testIndex();
});

jest.mock('../src/storage/eip7730Index', () => ({
  loadSlice: async () => null,
}));

import { lookupCalldata, setSavedIndex } from '../src/utils/eip7730/lookup';

const ADDRESS = '0x000000000000000000000000000000000000beef';

it('builds the bundled index only when it is the source, and once', async () => {
  setSavedIndex({ generatedAt: '2026-10-12T00:00:00.000Z' });
  await lookupCalldata(1, ADDRESS, '0xa9059cbb');
  expect(mockBundledBuilds).toBe(0);

  setSavedIndex(null);
  lookupCalldata(1, ADDRESS, '0xa9059cbb');
  lookupCalldata(1, ADDRESS, '0xa9059cbb');
  expect(mockBundledBuilds).toBe(1);
});
