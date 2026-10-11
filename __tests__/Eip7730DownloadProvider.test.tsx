import React, { useContext } from 'react';
import { Text, View } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { Eip7730Context } from '../src/providers/eip7730/context';
import { Eip7730DownloadProvider } from '../src/providers/eip7730/Provider.online';

const mockSavePersistedIndex = jest.fn();
const mockSaveIndexedAt = jest.fn();

jest.mock('../src/storage/eip7730Index', () => ({
  savePersistedIndex: (...args: any[]) => mockSavePersistedIndex(...args),
  saveIndexedAt: (...args: any[]) => mockSaveIndexedAt(...args),
}));

const mockRestore = jest.fn();
jest.mock('../src/utils/eip7730/restore', () => ({
  restorePersistedIndex: (...args: any[]) => mockRestore(...args),
}));

const mockLoadSource = jest.fn();
const mockLoadUrl = jest.fn();
const mockLoadWifi = jest.fn();
const mockLoadEtag = jest.fn();
const mockLoadLastModified = jest.fn();
const mockSaveEtag = jest.fn();
const mockSaveLastModified = jest.fn();

jest.mock('../src/storage/eip7730Settings.online', () => ({
  loadDescriptorSource: (...args: any[]) => mockLoadSource(...args),
  loadDescriptorUrl: (...args: any[]) => mockLoadUrl(...args),
  loadWifiOnly: (...args: any[]) => mockLoadWifi(...args),
  loadEtag: (...args: any[]) => mockLoadEtag(...args),
  loadLastModified: (...args: any[]) => mockLoadLastModified(...args),
  saveEtag: (...args: any[]) => mockSaveEtag(...args),
  saveLastModified: (...args: any[]) => mockSaveLastModified(...args),
}));

const mockProcess = jest.fn();
jest.mock('../src/utils/eip7730/zip', () => ({
  processLedgerRegistryZip: (...args: any[]) => mockProcess(...args),
  isEmptyIndex: (index: any) =>
    Object.keys(index.contracts).length === 0 &&
    Object.keys(index.eip712).length === 0,
}));

const INDEX = {
  version: 2,
  generatedAt: '2025-01-01T00:00:00.000Z',
  contracts: { '1:0xabc': { '0xa9059cbb': { intent: 'Send', fields: [] } } },
  eip712: {},
};

const mockSetRuntimeIndex = jest.fn();
jest.mock('../src/utils/eip7730/lookup', () => ({
  setRuntimeIndex: (...args: any[]) => mockSetRuntimeIndex(...args),
}));

const mockNetInfoFetch = jest.fn();
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { fetch: (...args: any[]) => mockNetInfoFetch(...args) },
}));

function PhaseProbe() {
  const ctx = useContext(Eip7730Context);
  return (
    <View>
      <Text testID="phase">{ctx.phase}</Text>
    </View>
  );
}

function buildResponse({
  status = 200,
  body = new Uint8Array([1, 2, 3]),
  etag = null,
  lastModified = null,
}: {
  status?: number;
  body?: Uint8Array;
  etag?: string | null;
  lastModified?: string | null;
} = {}) {
  const headers = new Map<string, string>();
  if (etag) headers.set('etag', etag);
  if (lastModified) headers.set('last-modified', lastModified);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) => headers.get(k.toLowerCase()) ?? null,
    },
    body: null,
    arrayBuffer: async () =>
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRestore.mockResolvedValue(undefined);
  mockSavePersistedIndex.mockResolvedValue(undefined);
  mockSaveIndexedAt.mockResolvedValue(undefined);
  mockLoadSource.mockResolvedValue('manual');
  mockLoadUrl.mockResolvedValue('https://example.test/registry.zip');
  mockLoadWifi.mockResolvedValue(false);
  mockLoadEtag.mockResolvedValue(null);
  mockLoadLastModified.mockResolvedValue(null);
  mockSaveEtag.mockResolvedValue(undefined);
  mockSaveLastModified.mockResolvedValue(undefined);
  mockProcess.mockReturnValue(INDEX);
  mockNetInfoFetch.mockResolvedValue({ type: 'wifi' });
  (global as any).fetch = jest.fn();
});

describe('Eip7730DownloadProvider', () => {
  it('stays idle when source is manual', async () => {
    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );
    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('idle');
    });
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('downloads and processes when source is auto', async () => {
    mockLoadSource.mockResolvedValue('auto');
    (global as any).fetch.mockResolvedValue(buildResponse({ etag: 'W/abc' }));

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('done');
    });
    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://example.test/registry.zip',
      { headers: {} },
    );
    expect(mockProcess).toHaveBeenCalled();
    expect(mockSavePersistedIndex).toHaveBeenCalled();
    expect(mockSaveIndexedAt).toHaveBeenCalled();
    expect(mockSaveEtag).toHaveBeenCalledWith('W/abc');
    expect(mockSetRuntimeIndex).toHaveBeenCalledWith(INDEX);
  });

  it('keeps the current index when the download has no descriptors', async () => {
    mockLoadSource.mockResolvedValue('auto');
    mockProcess.mockReturnValue({ ...INDEX, contracts: {} });
    (global as any).fetch.mockResolvedValue(buildResponse({ etag: 'W/new' }));

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('error');
    });
    expect(mockSavePersistedIndex).not.toHaveBeenCalled();
    expect(mockSaveEtag).not.toHaveBeenCalled();
    expect(mockSetRuntimeIndex).not.toHaveBeenCalled();
  });

  it('skips processing when server returns 304', async () => {
    mockLoadSource.mockResolvedValue('auto');
    mockLoadEtag.mockResolvedValue('W/old');
    (global as any).fetch.mockResolvedValue(buildResponse({ status: 304 }));

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('done');
    });
    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://example.test/registry.zip',
      { headers: { 'If-None-Match': 'W/old' } },
    );
    expect(mockProcess).not.toHaveBeenCalled();
    expect(mockSavePersistedIndex).not.toHaveBeenCalled();
  });

  it('skips download when wifi-only and connection is cellular', async () => {
    mockLoadSource.mockResolvedValue('auto');
    mockLoadWifi.mockResolvedValue(true);
    mockNetInfoFetch.mockResolvedValue({ type: 'cellular' });

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('idle');
    });
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('triggerDownload forces a download even when source is manual', async () => {
    (global as any).fetch.mockResolvedValue(buildResponse());

    function TriggerProbe() {
      const ctx = useContext(Eip7730Context);
      return (
        <View>
          <Text testID="phase">{ctx.phase}</Text>
          <Text testID="trigger" onPress={() => ctx.triggerDownload()}>
            go
          </Text>
        </View>
      );
    }
    render(
      <Eip7730DownloadProvider>
        <TriggerProbe />
      </Eip7730DownloadProvider>,
    );
    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalled();
    });
    // initial run: manual -> idle, no fetch
    expect((global as any).fetch).not.toHaveBeenCalled();

    await act(async () => {
      screen.getByTestId('trigger').props.onPress();
    });

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalled();
    });
  });

  it('reports error phase when fetch fails', async () => {
    mockLoadSource.mockResolvedValue('auto');
    (global as any).fetch.mockRejectedValue(new Error('boom'));

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('error');
    });
  });

  it('reads a streamed body in chunks and keeps Last-Modified', async () => {
    mockLoadSource.mockResolvedValue('auto');
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3])];
    const headers: Record<string, string> = {
      'content-length': '3',
      'last-modified': 'Sat, 10 Oct 2026 00:00:00 GMT',
    };
    (global as any).fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
      body: {
        getReader: () => ({
          read: async () =>
            chunks.length > 0
              ? { value: chunks.shift(), done: false }
              : { value: undefined, done: true },
        }),
      },
    });

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('done');
    });
    expect(Array.from(mockProcess.mock.calls[0][0])).toEqual([1, 2, 3]);
    expect(mockSaveLastModified).toHaveBeenCalledWith(
      'Sat, 10 Oct 2026 00:00:00 GMT',
    );
  });

  it('downloads when Wi-Fi only is on but the network state cannot be read', async () => {
    mockLoadSource.mockResolvedValue('auto');
    mockLoadWifi.mockResolvedValue(true);
    mockNetInfoFetch.mockRejectedValue(new Error('unavailable'));
    (global as any).fetch.mockResolvedValue(buildResponse());

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('done');
    });
  });

  it('reports an HTTP error status', async () => {
    mockLoadSource.mockResolvedValue('auto');
    (global as any).fetch.mockResolvedValue(buildResponse({ status: 500 }));

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('error');
    });
    expect(mockProcess).not.toHaveBeenCalled();
  });

  it('waits for the saved index before the first auto-download', async () => {
    mockLoadSource.mockResolvedValue('auto');
    (global as any).fetch.mockResolvedValue(buildResponse());
    let finishRestore: () => void = () => {};
    mockRestore.mockReturnValue(
      new Promise<void>(resolve => {
        finishRestore = resolve;
      }),
    );

    render(
      <Eip7730DownloadProvider>
        <PhaseProbe />
      </Eip7730DownloadProvider>,
    );

    await waitFor(() => {
      expect(mockRestore).toHaveBeenCalled();
    });
    expect((global as any).fetch).not.toHaveBeenCalled();

    await act(async () => {
      finishRestore();
    });
    await waitFor(() => {
      expect(screen.getByTestId('phase').children[0]).toBe('done');
    });
    expect((global as any).fetch).toHaveBeenCalled();
  });
});
