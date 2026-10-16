import RNFS from 'react-native-fs';

import bundledMeta from '@/data/eip7730.meta.json';
import {
  EIP7730_INDEX_VERSION,
  sliceIndex,
  type Eip7730Index,
  type Eip7730IndexSlice,
} from '@/utils/eip7730/zip';

const FOLDER = 'eip7730';
const STAGING = 'eip7730-next';
const MANIFEST = 'manifest.json';

export type IndexSource = 'import' | 'download';

/** The registry this build carries; only an app update changes it. */
export const BUNDLED_REGISTRY: string =
  bundledMeta.registryCommit ?? bundledMeta.generatedAt;

export type SavedIndexManifest = {
  version: number;
  generatedAt: string;
  source?: IndexSource;
  /** BUNDLED_REGISTRY when this was saved. */
  bundled: string;
};

function folder(name = FOLDER): string {
  return `${RNFS.DocumentDirectoryPath}/${name}`;
}

function isManifest(value: unknown): value is SavedIndexManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<SavedIndexManifest>;
  return (
    manifest.version === EIP7730_INDEX_VERSION &&
    typeof manifest.generatedAt === 'string' &&
    typeof manifest.bundled === 'string' &&
    (manifest.source === undefined ||
      manifest.source === 'import' ||
      manifest.source === 'download')
  );
}

/** Startup reads only this; a review reads the one slice it needs. */
export async function loadManifest(): Promise<SavedIndexManifest | null> {
  try {
    if (!(await RNFS.exists(folder()))) return null;
    const manifest: unknown = JSON.parse(
      await RNFS.readFile(`${folder()}/${MANIFEST}`, 'utf8'),
    );
    if (isManifest(manifest)) return manifest;
  } catch {
    // No manifest or an unreadable one: dropped like an outdated index.
  }
  // The bundled index applies until the next import or download.
  await clearSavedIndex();
  return null;
}

function isSlice(value: unknown): value is Eip7730IndexSlice {
  if (typeof value !== 'object' || value === null) return false;
  const slice = value as Partial<Eip7730IndexSlice>;
  return (
    Array.isArray(slice.formats) &&
    typeof slice.contracts === 'object' &&
    slice.contracts !== null &&
    typeof slice.eip712 === 'object' &&
    slice.eip712 !== null
  );
}

export async function loadSlice(
  name: string,
): Promise<Eip7730IndexSlice | null> {
  try {
    const path = `${folder()}/${name}.json`;
    if (!(await RNFS.exists(path))) return null;
    const slice: unknown = JSON.parse(await RNFS.readFile(path, 'utf8'));
    return isSlice(slice) ? slice : null;
  } catch {
    return null;
  }
}

// An import, a download and a revert can overlap, and two writers would share the staging folder.
let writes: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const next = writes.then(task, task);
  writes = next.catch(() => undefined);
  return next;
}

export function saveIndex(
  index: Eip7730Index,
  source: IndexSource,
): Promise<SavedIndexManifest> {
  return oneAtATime(() => writeIndex(index, source));
}

export function clearSavedIndex(): Promise<void> {
  return oneAtATime(removeIndex);
}

async function writeIndex(
  index: Eip7730Index,
  source: IndexSource,
): Promise<SavedIndexManifest> {
  const staging = folder(STAGING);
  if (await RNFS.exists(staging)) await RNFS.unlink(staging);
  await RNFS.mkdir(staging);
  await Promise.all(
    [...sliceIndex(index)].map(([name, slice]) =>
      RNFS.writeFile(`${staging}/${name}.json`, JSON.stringify(slice), 'utf8'),
    ),
  );
  const manifest = {
    version: index.version,
    generatedAt: index.generatedAt,
    source,
    bundled: BUNDLED_REGISTRY,
  };
  // Written last, so a folder cut short by a failure has none and is ignored.
  await RNFS.writeFile(
    `${staging}/${MANIFEST}`,
    JSON.stringify(manifest),
    'utf8',
  );
  await removeIndex();
  await RNFS.moveFile(staging, folder());
  return manifest;
}

async function removeIndex(): Promise<void> {
  try {
    if (await RNFS.exists(folder())) await RNFS.unlink(folder());
  } catch {
    // Nothing to do: the next save replaces it.
  }
}
