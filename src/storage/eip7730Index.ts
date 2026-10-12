import RNFS from 'react-native-fs';

import {
  EIP7730_INDEX_VERSION,
  sliceIndex,
  type Eip7730Index,
  type Eip7730IndexSlice,
} from '@/utils/eip7730/zip';

const FOLDER = 'eip7730';
const STAGING = 'eip7730-next';
const MANIFEST = 'manifest.json';

export type SavedIndexManifest = { version: number; generatedAt: string };

function folder(name = FOLDER): string {
  return `${RNFS.DocumentDirectoryPath}/${name}`;
}

function isManifest(value: unknown): value is SavedIndexManifest {
  if (typeof value !== 'object' || value === null) return false;
  const manifest = value as Partial<SavedIndexManifest>;
  return (
    manifest.version === EIP7730_INDEX_VERSION &&
    typeof manifest.generatedAt === 'string'
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

export async function saveIndex(
  index: Eip7730Index,
): Promise<SavedIndexManifest> {
  const staging = folder(STAGING);
  if (await RNFS.exists(staging)) await RNFS.unlink(staging);
  await RNFS.mkdir(staging);
  await Promise.all(
    [...sliceIndex(index)].map(([name, slice]) =>
      RNFS.writeFile(`${staging}/${name}.json`, JSON.stringify(slice), 'utf8'),
    ),
  );
  const manifest = { version: index.version, generatedAt: index.generatedAt };
  // Written last, so a folder cut short by a failure has none and is ignored.
  await RNFS.writeFile(
    `${staging}/${MANIFEST}`,
    JSON.stringify(manifest),
    'utf8',
  );
  await clearSavedIndex();
  await RNFS.moveFile(staging, folder());
  return manifest;
}

export async function clearSavedIndex(): Promise<void> {
  try {
    if (await RNFS.exists(folder())) await RNFS.unlink(folder());
  } catch {
    // Nothing to do: the next save replaces it.
  }
}
