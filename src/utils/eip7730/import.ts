import { Platform } from 'react-native';
import { pick, types } from '@react-native-documents/picker';
import RNFS from 'react-native-fs';

import { saveIndex } from '@/storage/eip7730Index';

import { BUNDLED_ATTESTATIONS } from './knownAttestations';
import { setSavedIndex } from './lookup';
import { isEmptyIndex, processRegistryZip } from './zip';

import type { Eip7730Index } from './zip';

export type ImportResult =
  | { ok: true; index: Eip7730Index }
  | { ok: false; reason: 'cancelled' | 'invalid' | 'unreadable' | 'unsaved' };

function base64ToBytes(b64: string): Uint8Array {
  const binary =
    typeof atob === 'function'
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export async function importRegistryZipFromPicker(): Promise<ImportResult> {
  const type = [types.zip, 'application/zip'];
  let result;
  try {
    // Only Android's system picker always answers with a link it grants read access to.
    result =
      Platform.OS === 'android'
        ? await pick({ type, mode: 'open' })
        : await pick({ type });
  } catch {
    return { ok: false, reason: 'cancelled' };
  }
  const file = Array.isArray(result) ? result[0] : result;
  if (!file?.uri) return { ok: false, reason: 'cancelled' };

  let bytes: Uint8Array;
  try {
    // react-native-fs reads a path on iOS, and the picker hands back a file URL.
    const source =
      Platform.OS === 'ios'
        ? decodeURIComponent(file.uri.replace(/^file:\/\//, ''))
        : file.uri;
    const b64 = await RNFS.readFile(source, 'base64');
    bytes = base64ToBytes(b64);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  let index: Eip7730Index;
  try {
    index = processRegistryZip(bytes, { verified: BUNDLED_ATTESTATIONS });
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (isEmptyIndex(index)) return { ok: false, reason: 'invalid' };

  let generatedAt: string;
  try {
    ({ generatedAt } = await saveIndex(index, 'import'));
  } catch {
    return { ok: false, reason: 'unsaved' };
  }
  setSavedIndex({ generatedAt, source: 'import' });
  return { ok: true, index };
}
