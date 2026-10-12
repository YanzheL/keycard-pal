import { useCallback, useMemo } from 'react';

import { useEip7730Format } from '@/hooks/useEip7730Format';

import { lookupCalldata } from '@/utils/eip7730/lookup';
import {
  buildArgsEachResolver,
  buildArgsPathResolver,
  decodeArgsBySignature,
  type Eip7730Container,
} from '@/utils/eip7730/paths';
import type { Eip7730DisplayFormat } from '@/utils/eip7730/zip';

/** A registry entry that matched a call, with its arguments decoded by its own signature. */
export type MatchedDescriptor = {
  format: Eip7730DisplayFormat;
  resolvePath: (path: string) => string | null;
  resolveEach: (path: string) => string[];
};

/** `container` must be stable (useMemo); a top-level call and every inner call match the same way. */
export function useCalldataDescriptor({
  chainId,
  contract,
  data,
  container,
  enabled = true,
}: {
  chainId: number | undefined;
  contract: string | undefined;
  data: string;
  container: Eip7730Container;
  enabled?: boolean;
}): { descriptor: MatchedDescriptor | null; loading: boolean } {
  const selector = data.length >= 10 ? data.slice(0, 10) : null;
  const lookup = useCallback(
    () =>
      enabled && chainId !== undefined && contract && selector
        ? lookupCalldata(chainId, contract, selector)
        : null,
    [enabled, chainId, contract, selector],
  );
  const { format, loading } = useEip7730Format(lookup);

  const descriptor = useMemo<MatchedDescriptor | null>(() => {
    if (!format?.signature) return null;
    // An entry whose signature does not fit the bytes is not describing this call.
    const args = decodeArgsBySignature(format.signature, data);
    if (!args) return null;
    return {
      format,
      resolvePath: buildArgsPathResolver(args, container),
      resolveEach: buildArgsEachResolver(args, container),
    };
  }, [format, data, container]);

  return { descriptor, loading };
}
