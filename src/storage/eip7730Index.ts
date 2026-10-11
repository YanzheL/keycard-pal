import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

import { EIP7730_INDEX_VERSION, type Eip7730Index } from '@/utils/eip7730/zip';

const INDEX_FILENAME = 'eip7730-index.json';
const INDEXED_AT_KEY = 'eip7730_indexed_at';

function indexPath(): string {
  return `${RNFS.DocumentDirectoryPath}/${INDEX_FILENAME}`;
}

function isCurrentIndex(value: unknown): value is Eip7730Index {
  if (typeof value !== 'object' || value === null) return false;
  const index = value as Partial<Eip7730Index>;
  return (
    index.version === EIP7730_INDEX_VERSION &&
    typeof index.contracts === 'object' &&
    typeof index.eip712 === 'object'
  );
}

export async function loadPersistedIndex(): Promise<Eip7730Index | null> {
  try {
    const path = indexPath();
    if (!(await RNFS.exists(path))) return null;
    const index: unknown = JSON.parse(await RNFS.readFile(path, 'utf8'));
    if (isCurrentIndex(index)) return index;
    // Built by an older parser: drop it so the bundled index applies until the next import.
    await clearPersistedIndex();
    await AsyncStorage.removeItem(INDEXED_AT_KEY);
    return null;
  } catch {
    return null;
  }
}

export async function savePersistedIndex(index: Eip7730Index): Promise<void> {
  await RNFS.writeFile(indexPath(), JSON.stringify(index), 'utf8');
}

export async function clearPersistedIndex(): Promise<void> {
  try {
    const path = indexPath();
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch {
    // ignore
  }
}

export async function loadIndexedAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(INDEXED_AT_KEY);
  } catch {
    return null;
  }
}

export async function saveIndexedAt(date: string): Promise<void> {
  await AsyncStorage.setItem(INDEXED_AT_KEY, date);
}
