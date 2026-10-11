import { Platform } from 'react-native';

import {
  getLastIndexedAt,
  importLedgerRegistryZipFromPicker,
} from '../src/utils/eip7730/import';

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

const mockSavePersistedIndex = jest.fn();
const mockSaveIndexedAt = jest.fn();
const mockLoadIndexedAt = jest.fn();
jest.mock('../src/storage/eip7730Index', () => ({
  loadIndexedAt: (...args: any[]) => mockLoadIndexedAt(...args),
  savePersistedIndex: (...args: any[]) => mockSavePersistedIndex(...args),
  saveIndexedAt: (...args: any[]) => mockSaveIndexedAt(...args),
}));

const mockSetRuntimeIndex = jest.fn();
jest.mock('../src/utils/eip7730/lookup', () => ({
  setRuntimeIndex: (...args: any[]) => mockSetRuntimeIndex(...args),
}));

const mockProcess = jest.fn();
jest.mock('../src/utils/eip7730/zip', () => ({
  ...jest.requireActual('../src/utils/eip7730/zip'),
  processLedgerRegistryZip: (...args: any[]) => mockProcess(...args),
}));

const INDEX = {
  version: 2,
  generatedAt: '',
  contracts: { '1:0xabc': { '0xa9059cbb': { intent: 'Send', fields: [] } } },
  eip712: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPick.mockResolvedValue([{ uri: 'content://registry.zip' }]);
  mockReadFile.mockResolvedValue(Buffer.from('zip').toString('base64'));
  mockProcess.mockReturnValue(INDEX);
});

describe('importLedgerRegistryZipFromPicker', () => {
  it('saves and activates an index with descriptors', async () => {
    const result = await importLedgerRegistryZipFromPicker();
    expect(result).toMatchObject({ ok: true, index: INDEX });
    expect(mockSavePersistedIndex).toHaveBeenCalledWith(INDEX);
    expect(mockSetRuntimeIndex).toHaveBeenCalledWith(INDEX);
  });

  it("opens Android's system picker, which grants the file it returns", async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await importLedgerRegistryZipFromPicker();
    expect(mockPick).toHaveBeenCalledWith({
      type: ['application/zip', 'application/zip'],
      mode: 'open',
    });
  });

  it('keeps import mode on iOS, where the picker copies the file', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await importLedgerRegistryZipFromPicker();
    expect(mockPick).toHaveBeenCalledWith({
      type: ['application/zip', 'application/zip'],
    });
  });

  it('refuses a zip with no descriptors and keeps the current index', async () => {
    mockProcess.mockReturnValue({ ...INDEX, contracts: {} });
    expect(await importLedgerRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(mockSavePersistedIndex).not.toHaveBeenCalled();
    expect(mockSetRuntimeIndex).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a zip', async () => {
    mockProcess.mockImplementation(() => {
      throw new Error('not a zip');
    });
    expect(await importLedgerRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('reports a cancelled pick and an unreadable file', async () => {
    mockPick.mockRejectedValueOnce(new Error('cancelled'));
    expect(await importLedgerRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'cancelled',
    });
    mockPick.mockResolvedValueOnce([{}]);
    expect(await importLedgerRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'cancelled',
    });
    mockReadFile.mockRejectedValueOnce(new Error('io'));
    expect(await importLedgerRegistryZipFromPicker()).toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('decodes the file without atob too', async () => {
    const atob = (global as any).atob;
    delete (global as any).atob;
    try {
      expect(await importLedgerRegistryZipFromPicker()).toMatchObject({
        ok: true,
      });
      expect(Array.from(mockProcess.mock.calls[0][0])).toEqual([
        ...Buffer.from('zip'),
      ]);
    } finally {
      (global as any).atob = atob;
    }
  });

  it('reads the date of the last update', async () => {
    mockLoadIndexedAt.mockResolvedValue('2026-10-11');
    expect(await getLastIndexedAt()).toBe('2026-10-11');
  });
});
