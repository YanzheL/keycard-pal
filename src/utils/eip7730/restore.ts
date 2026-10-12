import bundledMeta from '@/data/eip7730.meta.json';
import { clearSavedIndex, loadManifest } from '@/storage/eip7730Index';

import { getSavedIndex, setSavedIndex } from './lookup';

let restoring: Promise<void> | null = null;

// One read per app run, shared by both builds; the online download waits on it.
export function restorePersistedIndex(): Promise<void> {
  if (!restoring) {
    restoring = loadManifest().then(async manifest => {
      // An import or a download may have finished first.
      if (!manifest || getSavedIndex()) return;
      // An app update can ship a bundled index built after this one was saved.
      if (
        Date.parse(bundledMeta.generatedAt) > Date.parse(manifest.generatedAt)
      ) {
        await clearSavedIndex();
        return;
      }
      setSavedIndex({ generatedAt: manifest.generatedAt });
    });
  }
  return restoring;
}

export async function revertToBundledIndex(): Promise<void> {
  // A restore still reading would bring the saved index back.
  await restorePersistedIndex();
  await clearSavedIndex();
  setSavedIndex(null);
}
