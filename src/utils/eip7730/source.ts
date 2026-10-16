import { rfc3339 } from '@/utils/rfc3339';

import { TRUSTED_ATTESTERS } from './attestation';
import type { SavedIndex } from './lookup';

export const BUNDLED_SOURCE_TEXT = 'From the registry bundled with Keycard Pal';
export const NOT_REVIEWED_TEXT = 'Not reviewed by an auditor';

// Checked again here: a saved index can predate a change to the trusted list.
export function reviewerNames(
  reviewedBy: readonly string[] | undefined,
): string[] {
  const names = (reviewedBy ?? []).flatMap(address => {
    const name = TRUSTED_ATTESTERS.get(address);
    return name ? [name] : [];
  });
  return [...new Set(names)];
}

export function descriptorReview(
  reviewedBy: readonly string[] | undefined,
): string {
  const names = reviewerNames(reviewedBy);
  return names.length ? `Reviewed by ${names.join(', ')}` : NOT_REVIEWED_TEXT;
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
  const day = rfc3339(Date.parse(saved.generatedAt))?.slice(0, 10);
  return day ? `From a registry ${how} on ${day}` : `From a registry ${how}`;
}
