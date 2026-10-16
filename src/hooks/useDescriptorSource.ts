import { useSyncExternalStore } from 'react';

import { getSavedIndex, subscribeSavedIndex } from '@/utils/eip7730/lookup';
import { descriptorSource } from '@/utils/eip7730/source';

export function useDescriptorSource(): string {
  return descriptorSource(
    useSyncExternalStore(subscribeSavedIndex, getSavedIndex),
  );
}
