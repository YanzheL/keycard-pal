import RNFS from 'react-native-fs';

import { EIP7730_INDEX_VERSION, type Eip7730Index } from '@/utils/eip7730/zip';

const INDEX_FILENAME = 'eip7730-index.json';

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
  } catch {
    // Unreadable, for example cut short by a failed write: dropped like an outdated one.
  }
  // The bundled index applies until the next import or download.
  await clearPersistedIndex();
  return null;
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
