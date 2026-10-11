const mockLoadPersistedIndex = jest.fn();
jest.mock('../src/storage/eip7730Index', () => ({
  loadPersistedIndex: (...args: any[]) => mockLoadPersistedIndex(...args),
}));

const SAVED = { version: 2, generatedAt: '', contracts: {}, eip712: {} };

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

beforeEach(() => jest.clearAllMocks());

describe('restorePersistedIndex', () => {
  it('makes the saved index the active one', async () => {
    mockLoadPersistedIndex.mockResolvedValue(SAVED);
    const { restore, lookup } = load();
    await restore.restorePersistedIndex();
    expect(lookup.getActiveIndex()).toBe(SAVED);
  });

  it('reads the file once per app run', async () => {
    mockLoadPersistedIndex.mockResolvedValue(SAVED);
    const { restore } = load();
    await Promise.all([
      restore.restorePersistedIndex(),
      restore.restorePersistedIndex(),
    ]);
    expect(mockLoadPersistedIndex).toHaveBeenCalledTimes(1);
  });

  it('does not replace an index set while it was reading', async () => {
    let finish: (value: unknown) => void = () => {};
    mockLoadPersistedIndex.mockReturnValue(
      new Promise(resolve => {
        finish = resolve;
      }),
    );
    const { restore, lookup } = load();
    const pending = restore.restorePersistedIndex();
    const fresh = { ...SAVED, generatedAt: 'fresh' };
    lookup.setRuntimeIndex(fresh);
    finish(SAVED);
    await pending;
    expect(lookup.getActiveIndex()).toBe(fresh);
  });

  it('keeps the bundled index when nothing is saved', async () => {
    mockLoadPersistedIndex.mockResolvedValue(null);
    const { restore, lookup } = load();
    await restore.restorePersistedIndex();
    expect(lookup.hasRuntimeIndex()).toBe(false);
  });
});
