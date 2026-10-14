import {
  clearSavedIndex,
  loadManifest,
  loadSlice,
  saveIndex,
} from '../src/storage/eip7730Index';
import { EIP7730_INDEX_VERSION } from '../src/utils/eip7730/zip';

import { testIndex } from './eip7730Index.testUtils';

const mockExists = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();
const mockMkdir = jest.fn();
const mockMoveFile = jest.fn();

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    exists: (...args: any[]) => mockExists(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    unlink: (...args: any[]) => mockUnlink(...args),
    mkdir: (...args: any[]) => mockMkdir(...args),
    moveFile: (...args: any[]) => mockMoveFile(...args),
  },
}));

const FOLDER = '/docs/eip7730';
const STAGING = '/docs/eip7730-next';

const INDEX = testIndex({
  generatedAt: '2026-10-12T00:00:00.000Z',
  contracts: {
    '1:0x00000000000000000000000000000000000000aa': {
      '0xa9059cbb': { intent: 'Send', fields: [] },
    },
    '1:0xab00000000000000000000000000000000000001': {
      '0xa9059cbb': { intent: 'Send', fields: [] },
    },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockExists.mockResolvedValue(true);
  mockWriteFile.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(undefined);
  mockMkdir.mockResolvedValue(undefined);
  mockMoveFile.mockResolvedValue(undefined);
});

describe('loadManifest', () => {
  it('returns a manifest of the current version', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ version: EIP7730_INDEX_VERSION, generatedAt: 'x' }),
    );
    expect(await loadManifest()).toEqual({
      version: EIP7730_INDEX_VERSION,
      generatedAt: 'x',
    });
    expect(mockReadFile).toHaveBeenCalledWith(
      `${FOLDER}/manifest.json`,
      'utf8',
    );
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('reads where the index came from, and a manifest saved before it said so', async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({
        version: EIP7730_INDEX_VERSION,
        generatedAt: 'x',
        source: 'import',
      }),
    );
    expect(await loadManifest()).toMatchObject({ source: 'import' });
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify({ version: EIP7730_INDEX_VERSION, generatedAt: 'x' }),
    );
    expect((await loadManifest())?.source).toBeUndefined();
  });

  it('drops a manifest naming a source it does not know', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        version: EIP7730_INDEX_VERSION,
        generatedAt: 'x',
        source: 'mail',
      }),
    );
    expect(await loadManifest()).toBeNull();
  });

  it('returns null without touching anything when nothing is saved', async () => {
    mockExists.mockResolvedValueOnce(false);
    expect(await loadManifest()).toBeNull();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('drops a saved index of another version, so the bundled one applies', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ version: EIP7730_INDEX_VERSION - 1, generatedAt: 'x' }),
    );
    expect(await loadManifest()).toBeNull();
    expect(mockUnlink).toHaveBeenCalledWith(FOLDER);
  });

  it('drops a folder whose manifest is missing or unreadable, a save cut short', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('no file'));
    expect(await loadManifest()).toBeNull();
    mockReadFile.mockResolvedValueOnce('{"version":3,"gener');
    expect(await loadManifest()).toBeNull();
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });
});

describe('loadSlice', () => {
  it('reads one slice file', async () => {
    mockReadFile.mockResolvedValue('{"formats":[],"contracts":{},"eip712":{}}');
    expect(await loadSlice('ab')).toEqual({
      formats: [],
      contracts: {},
      eip712: {},
    });
    expect(mockReadFile).toHaveBeenCalledWith(`${FOLDER}/ab.json`, 'utf8');
  });

  it('returns null for a slice that is not shaped like one', async () => {
    for (const text of ['null', '[]', '{"formats":{}}', '{"formats":[]}']) {
      mockReadFile.mockResolvedValueOnce(text);
      expect(await loadSlice('ab')).toBeNull();
    }
  });

  it('returns null for a slice that does not exist or cannot be read', async () => {
    mockExists.mockResolvedValueOnce(false);
    expect(await loadSlice('ab')).toBeNull();
    mockReadFile.mockRejectedValueOnce(new Error('io'));
    expect(await loadSlice('ab')).toBeNull();
  });
});

describe('saveIndex', () => {
  it('writes one file per slice, the manifest last, then swaps the folder in', async () => {
    mockExists.mockResolvedValue(false);
    const manifest = await saveIndex(INDEX, 'download');

    expect(manifest).toEqual({
      version: EIP7730_INDEX_VERSION,
      generatedAt: '2026-10-12T00:00:00.000Z',
      source: 'download',
    });
    expect(JSON.parse(mockWriteFile.mock.calls[2][1])).toEqual(manifest);
    expect(mockMkdir).toHaveBeenCalledWith(STAGING);
    const written = mockWriteFile.mock.calls.map(call => call[0]);
    expect(written).toEqual([
      `${STAGING}/00.json`,
      `${STAGING}/ab.json`,
      `${STAGING}/manifest.json`,
    ]);
    expect(JSON.parse(mockWriteFile.mock.calls[0][1]).contracts).toEqual({
      '0x00000000000000000000000000000000000000aa': { '0xa9059cbb': { 1: 0 } },
    });
    expect(mockMoveFile).toHaveBeenCalledWith(STAGING, FOLDER);
  });

  it('clears leftovers of an earlier attempt and the previous index', async () => {
    await saveIndex(INDEX, 'import');
    expect(mockUnlink).toHaveBeenCalledWith(STAGING);
    expect(mockUnlink).toHaveBeenCalledWith(FOLDER);
  });

  it('fails without swapping when a slice cannot be written', async () => {
    mockWriteFile.mockRejectedValueOnce(new Error('ENOSPC'));
    await expect(saveIndex(INDEX, 'import')).rejects.toThrow('ENOSPC');
    expect(mockMoveFile).not.toHaveBeenCalled();
  });
});

describe('clearSavedIndex', () => {
  it('deletes the folder only when it exists, and swallows errors', async () => {
    mockExists.mockResolvedValueOnce(false);
    await clearSavedIndex();
    expect(mockUnlink).not.toHaveBeenCalled();
    mockUnlink.mockRejectedValueOnce(new Error('io'));
    await expect(clearSavedIndex()).resolves.toBeUndefined();
  });
});
