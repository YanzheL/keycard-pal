import {
  clearPersistedIndex,
  loadIndexedAt,
  loadPersistedIndex,
  saveIndexedAt,
  savePersistedIndex,
} from '../src/storage/eip7730Index';
import { EIP7730_INDEX_VERSION } from '../src/utils/eip7730/zip';

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: any[]) => mockGetItem(...args),
    setItem: (...args: any[]) => mockSetItem(...args),
    removeItem: (...args: any[]) => mockRemoveItem(...args),
  },
}));

const mockExists = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();

jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    DocumentDirectoryPath: '/docs',
    exists: (...args: any[]) => mockExists(...args),
    readFile: (...args: any[]) => mockReadFile(...args),
    writeFile: (...args: any[]) => mockWriteFile(...args),
    unlink: (...args: any[]) => mockUnlink(...args),
  },
}));

const PATH = '/docs/eip7730-index.json';

function stored(version: number) {
  return JSON.stringify({
    version,
    generatedAt: '2026-10-11T00:00:00.000Z',
    contracts: {},
    eip712: {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockExists.mockResolvedValue(true);
});

describe('loadPersistedIndex', () => {
  it('returns an index of the current version', async () => {
    mockReadFile.mockResolvedValue(stored(EIP7730_INDEX_VERSION));
    const index = await loadPersistedIndex();
    expect(index?.version).toBe(EIP7730_INDEX_VERSION);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('drops an index from an older parser, and its date, so the bundled one applies', async () => {
    mockReadFile.mockResolvedValue(stored(EIP7730_INDEX_VERSION - 1));
    expect(await loadPersistedIndex()).toBeNull();
    expect(mockUnlink).toHaveBeenCalledWith(PATH);
    expect(mockRemoveItem).toHaveBeenCalledWith('eip7730_indexed_at');
  });

  it('drops a file that is not an index', async () => {
    mockReadFile.mockResolvedValue('{"version":2}');
    expect(await loadPersistedIndex()).toBeNull();
    expect(mockUnlink).toHaveBeenCalledWith(PATH);
  });

  it('returns null without a file, or when reading fails', async () => {
    mockExists.mockResolvedValueOnce(false);
    expect(await loadPersistedIndex()).toBeNull();
    mockReadFile.mockRejectedValueOnce(new Error('io'));
    expect(await loadPersistedIndex()).toBeNull();
  });
});

describe('the rest of the storage', () => {
  it('writes the index as JSON', async () => {
    const index = JSON.parse(stored(EIP7730_INDEX_VERSION));
    await savePersistedIndex(index);
    expect(mockWriteFile).toHaveBeenCalledWith(
      PATH,
      JSON.stringify(index),
      'utf8',
    );
  });

  it('clears the file only when it exists, and swallows errors', async () => {
    mockExists.mockResolvedValueOnce(false);
    await clearPersistedIndex();
    expect(mockUnlink).not.toHaveBeenCalled();
    mockUnlink.mockRejectedValueOnce(new Error('io'));
    await expect(clearPersistedIndex()).resolves.toBeUndefined();
  });

  it('reads and writes the date of the last update', async () => {
    mockGetItem.mockResolvedValueOnce('2026-10-11');
    expect(await loadIndexedAt()).toBe('2026-10-11');
    mockGetItem.mockRejectedValueOnce(new Error('io'));
    expect(await loadIndexedAt()).toBeNull();
    await saveIndexedAt('2026-10-12');
    expect(mockSetItem).toHaveBeenCalledWith(
      'eip7730_indexed_at',
      '2026-10-12',
    );
  });
});
