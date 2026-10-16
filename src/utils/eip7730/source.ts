import { rfc3339 } from '@/utils/rfc3339';

import type { SavedIndex } from './lookup';

export const BUNDLED_SOURCE_TEXT = 'From the registry bundled with Keycard Pal';

/** Where the active descriptors came from, so a review never passes off an import as the bundled registry. */
export function descriptorSource(saved: SavedIndex | null): string {
  if (!saved) return BUNDLED_SOURCE_TEXT;
  const how =
    saved.source === 'import'
      ? 'imported'
      : saved.source === 'download'
      ? 'downloaded'
      : 'added';
  const day = rfc3339(Date.parse(saved.generatedAt))?.slice(0, 10);
  return day ? `From a registry ${how} on ${day}` : `From a registry ${how}`;
}
