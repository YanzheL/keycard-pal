import {
  clearPersistedIndex,
  loadPersistedIndex,
  savePersistedIndex,
} from '../src/storage/eip7730Index';
import { EIP7730_INDEX_VERSION } from '../src/utils/eip7730/zip';

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

  it('drops an index from an older parser so the bundled one applies', async () => {
    mockReadFile.mockResolvedValue(stored(EIP7730_INDEX_VERSION - 1));
    expect(await loadPersistedIndex()).toBeNull();
    expect(mockUnlink).toHaveBeenCalledWith(PATH);
  });

  it('drops a file that is not an index', async () => {
    mockReadFile.mockResolvedValue('{"version":2}');
    expect(await loadPersistedIndex()).toBeNull();
    expect(mockUnlink).toHaveBeenCalledWith(PATH);
  });

  it('returns null without a file', async () => {
    mockExists.mockResolvedValueOnce(false);
    expect(await loadPersistedIndex()).toBeNull();
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('drops a file it cannot read or parse', async () => {
    mockReadFile.mockRejectedValueOnce(new Error('io'));
    expect(await loadPersistedIndex()).toBeNull();
    mockReadFile.mockResolvedValueOnce('{"version":2,"contr');
    expect(await loadPersistedIndex()).toBeNull();
    expect(mockUnlink).toHaveBeenCalledTimes(2);
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
});
