const mockLoadManifest = jest.fn();
const mockClearSavedIndex = jest.fn();
jest.mock('../src/storage/eip7730Index', () => ({
  loadManifest: (...args: any[]) => mockLoadManifest(...args),
  clearSavedIndex: (...args: any[]) => mockClearSavedIndex(...args),
}));

jest.mock('../src/data/eip7730.meta.json', () => ({
  generatedAt: '2026-10-10T00:00:00.000Z',
}));

const SAVED = { version: 3, generatedAt: '2026-10-11T00:00:00.000Z' };
const OLDER = { version: 3, generatedAt: '2026-10-09T00:00:00.000Z' };

function load() {
  let modules: {
    restore: typeof import('../src/utils/eip7730/restore');
    lookup: typeof import('../src/utils/eip7730/lookup');
  };
  jest.isolateModules(() => {
    modules = {
      restore: require('../src/utils/eip7730/restore'),
      lookup: require('../src/utils/eip7730/lookup'),
    };
  });
  return modules!;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockClearSavedIndex.mockResolvedValue(undefined);
});

describe('restorePersistedIndex', () => {
  it('makes a saved index the source, from its manifest alone', async () => {
    mockLoadManifest.mockResolvedValue({ ...SAVED, source: 'download' });
    const { restore, lookup } = load();
    await restore.restorePersistedIndex();
    expect(lookup.getSavedIndex()).toEqual({
      generatedAt: SAVED.generatedAt,
      source: 'download',
    });
  });

  it('reads the manifest once per app run', async () => {
    mockLoadManifest.mockResolvedValue(SAVED);
    const { restore } = load();
    await Promise.all([
      restore.restorePersistedIndex(),
      restore.restorePersistedIndex(),
    ]);
    expect(mockLoadManifest).toHaveBeenCalledTimes(1);
  });

  it('drops a saved index older than the bundled one an update brought', async () => {
    mockLoadManifest.mockResolvedValue(OLDER);
    const { restore, lookup } = load();
    await restore.restorePersistedIndex();
    expect(mockClearSavedIndex).toHaveBeenCalled();
    expect(lookup.getSavedIndex()).toBeNull();
  });

  it('leaves an import that finished while it was reading alone', async () => {
    const reading = deferred<typeof OLDER>();
    mockLoadManifest.mockReturnValue(reading.promise);
    const { restore, lookup } = load();
    const pending = restore.restorePersistedIndex();
    const fresh = { generatedAt: '2026-10-12T00:00:00.000Z' };
    lookup.setSavedIndex(fresh);
    reading.resolve(OLDER);
    await pending;
    expect(lookup.getSavedIndex()).toBe(fresh);
    expect(mockClearSavedIndex).not.toHaveBeenCalled();
  });

  it('keeps the bundled index when nothing is saved', async () => {
    mockLoadManifest.mockResolvedValue(null);
    const { restore, lookup } = load();
    await restore.restorePersistedIndex();
    expect(lookup.getSavedIndex()).toBeNull();
    expect(mockClearSavedIndex).not.toHaveBeenCalled();
  });
});

describe('revertToBundledIndex', () => {
  it('deletes the saved index and makes the bundled one the source', async () => {
    mockLoadManifest.mockResolvedValue(SAVED);
    const { restore, lookup } = load();
    await restore.restorePersistedIndex();
    await restore.revertToBundledIndex();
    expect(mockClearSavedIndex).toHaveBeenCalled();
    expect(lookup.getSavedIndex()).toBeNull();
  });

  it('waits for a restore still reading, so it cannot bring the index back', async () => {
    const reading = deferred<typeof SAVED>();
    mockLoadManifest.mockReturnValue(reading.promise);
    const { restore, lookup } = load();
    const pending = restore.revertToBundledIndex();
    reading.resolve(SAVED);
    await pending;
    expect(lookup.getSavedIndex()).toBeNull();
  });
});
