import attestations from '@/data/eip7730.attestations.json';

/** Attestations the generator verified for the bundled index, so an import recovers only newer signatures. */
export const BUNDLED_ATTESTATIONS: ReadonlyMap<string, string> = new Map(
  Object.entries(attestations as Record<string, string>),
);
