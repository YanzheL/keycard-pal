import type { SavedIndex } from './lookup';

export const BUNDLED_SOURCE_TEXT = 'From the registry bundled with Keycard Pal';

function localDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const offset = new Date(ms).getTimezoneOffset() * 60_000;
  return new Date(ms - offset).toISOString().slice(0, 10);
}

/** Where the active descriptors came from, so a review never passes off an import as the bundled registry. */
export function descriptorSource(saved: SavedIndex | null): string {
  if (!saved) return BUNDLED_SOURCE_TEXT;
  const how =
    saved.source === 'import'
      ? 'imported'
      : saved.source === 'download'
      ? 'downloaded'
      : 'added';
  const day = localDay(saved.generatedAt);
  return day ? `From a registry ${how} on ${day}` : `From a registry ${how}`;
}
