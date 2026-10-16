import { Platform } from 'react-native';

import { importRegistryZipFromPicker } from '../src/utils/eip7730/import';
import { BUNDLED_ATTESTATIONS } from '../src/utils/eip7730/knownAttestations';

import { testIndex } from './eip7730Index.testUtils';

const mockPick = jest.fn();
jest.mock('@react-native-documents/picker', () => ({
  pick: (...args: any[]) => mockPick(...args),
  types: { zip: 'application/zip' },
}));

afterEach(() => jest.restoreAllMocks());

const mockReadFile = jest.fn();
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: { readFile: (...args: any[]) => mockReadFile(...args) },
}));

const mockSaveIndex = jest.fn();
jest.mock('../src/storage/eip7730Index', () => ({
  saveIndex: (...args: any[]) => mockSaveIndex(...args),
}));

const mockSetSavedIndex = jest.fn();
jest.mock('../src/utils/eip7730/lookup', () => ({
  setSavedIndex: (...args: any[]) => mockSetSavedIndex(...args),
}));

const mockProcess = jest.fn();
jest.mock('../src/utils/eip7730/zip', () => ({
  ...jest.requireActual('../src/utils/eip7730/zip'),
  processRegistryZip: (...args: any[]) => mockProcess(...args),
}));

const INDEX = testIndex({
  contracts: { '1:0xabc': { '0xa9059cbb': { intent: 'Send', fields: [] } } },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue([{ uri: 'content://registry.zip' }]);
  mockReadFile.mockResolvedValue(Buffer.from('zip').toString('base64'));
  mockProcess.mockReturnValue(INDEX);
  mockSaveIndex.mockResolvedValue({
    version: 3,
    generatedAt: '2026-10-12T00:00:00.000Z',
  });
});

describe('importRegistryZipFromPicker', () => {
  it('saves and activates an index with descriptors', async () => {
    const result = await importRegistryZipFromPicker();
    expect(result).toEqual({ ok: true, index: INDEX });
    expect(mockSaveIndex).toHaveBeenCalledWith(INDEX, 'import');
    expect(mockSetSavedIndex).toHaveBeenCalledWith({
      generatedAt: '2026-10-12T00:00:00.000Z',
      source: 'import',
    });
  });

  it('skips the signatures the bundled index already verified', async () => {
    await importRegistryZipFromPicker();
    expect(mockProcess.mock.calls[0][1]).toEqual({
      verified: BUNDLED_ATTESTATIONS,
    });
  });

  it("opens Android's system picker, which grants the file it returns", async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await importRegistryZipFromPicker();
    expect(mockPick).toHaveBeenCalledWith({
      type: ['application/zip', 'application/zip'],
      mode: 'open',
    });
  });

  it('keeps import mode on iOS, where the picker copies the file', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await importRegistryZipFromPicker();
    expect(mockPick).toHaveBeenCalledWith({
      type: ['application/zip', 'application/zip'],
    });
  });

  it('reads the path behind the file URL the iOS picker returns', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockPick.mockResolvedValue([
      { uri: 'file:///private/var/mobile/tmp/My%20registry.zip' },
    ]);
    expect(await importRegistryZipFromPicker()).toEqual({
      ok: true,
      index: INDEX,
    });
    expect(mockReadFile).toHaveBeenCalledWith(
      '/private/var/mobile/tmp/My registry.zip',
      'base64',
    );
  });

  it('hands the content URI to the reader unchanged on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await importRegistryZipFromPicker();
    expect(mockReadFile).toHaveBeenCalledWith(
      'content://registry.zip',
      'base64',
    );
  });

  it('refuses a zip with no descriptors and keeps the current index', async () => {
    mockProcess.mockReturnValue({ ...INDEX, contracts: {} });
    expect(await importRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(mockSaveIndex).not.toHaveBeenCalled();
    expect(mockSetSavedIndex).not.toHaveBeenCalled();
  });

  it('reports a failed save and keeps the current index', async () => {
    mockSaveIndex.mockRejectedValueOnce(new Error('ENOSPC'));
    expect(await importRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'unsaved',
    });
    expect(mockSetSavedIndex).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a zip', async () => {
    mockProcess.mockImplementation(() => {
      throw new Error('not a zip');
    });
    expect(await importRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('reports a cancelled pick and an unreadable file', async () => {
    mockPick.mockRejectedValueOnce(new Error('cancelled'));
    expect(await importRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'cancelled',
    });
    mockPick.mockResolvedValueOnce([{}]);
    expect(await importRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'cancelled',
    });
    mockReadFile.mockRejectedValueOnce(new Error('io'));
    expect(await importRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('decodes the file without atob too', async () => {
    const atob = (global as any).atob;
    delete (global as any).atob;
    try {
      expect(await importRegistryZipFromPicker()).toMatchObject({
        ok: true,
      });
      expect(Array.from(mockProcess.mock.calls[0][0])).toEqual([
        ...Buffer.from('zip'),
      ]);
    } finally {
      (global as any).atob = atob;
    }
  });
});
