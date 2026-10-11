import { loadPersistedIndex } from '@/storage/eip7730Index';

import { hasRuntimeIndex, setRuntimeIndex } from './lookup';

let restoring: Promise<void> | null = null;

// One read per app run, shared by both builds; the online download waits on it.
export function restorePersistedIndex(): Promise<void> {
  if (!restoring) {
    restoring = loadPersistedIndex().then(index => {
      // An import or a download may have finished first.
      if (index && !hasRuntimeIndex()) setRuntimeIndex(index);
    });
  }
  return restoring;
}
