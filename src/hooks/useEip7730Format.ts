import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  getSavedIndex,
  subscribeSavedIndex,
  type FormatLookup,
} from '@/utils/eip7730/lookup';
import type { Eip7730DisplayFormat } from '@/utils/eip7730/zip';

type Settled = {
  from: Promise<Eip7730DisplayFormat | null>;
  format: Eip7730DisplayFormat | null;
};

/** `lookup` must be stable (useCallback); `loading` holds while a saved slice is read. */
export function useEip7730Format(lookup: () => FormatLookup): {
  format: Eip7730DisplayFormat | null;
  loading: boolean;
} {
  // Asks again when an import, a download or the reset changes the source.
  const saved = useSyncExternalStore(subscribeSavedIndex, getSavedIndex);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const result = useMemo(() => lookup(), [lookup, saved]);
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!(result instanceof Promise)) return;
    let current = true;
    result.then(format => {
      if (current) setSettled({ from: result, format });
    });
    return () => {
      current = false;
    };
  }, [result]);

  if (!(result instanceof Promise)) return { format: result, loading: false };
  return settled?.from === result
    ? { format: settled.format, loading: false }
    : { format: null, loading: true };
}
