import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import AddressInfoRow from '@/components/ens/AddressInfoRow.online';
import InfoRow from '@/components/InfoRow';

import { useCalldataDescriptor } from '@/hooks/useCalldataDescriptor';

import { checksumEthAddress } from '@/utils/ethereumAddress';
import type { Eip7730FieldContext } from '@/utils/eip7730/format';
import type { Eip7730Field } from '@/utils/eip7730/zip';
import { decodeCalldata } from '@/utils/txParser';

import DecodedCallSection, { isTokenCall } from './DecodedCallSection';
import { SectionHeader } from './shared';

// Deeper than this a crafted registry or calldata could nest without end.
const MAX_DEPTH = 3;

type InnerCallProps = {
  data: string;
  callee: string | undefined;
  chainId: number | undefined;
  amount: string | undefined;
  spender: string | undefined;
  depth: number;
};

function InnerCall({
  data,
  callee,
  chainId,
  amount,
  spender,
  depth,
}: InnerCallProps) {
  const tooDeep = depth > MAX_DEPTH;
  const container = useMemo(
    () => ({ to: callee, value: amount, from: spender, chainId }),
    [callee, amount, spender, chainId],
  );
  const { descriptor, loading } = useCalldataDescriptor({
    chainId,
    contract: callee,
    data,
    container,
    enabled: !tooDeep,
  });
  if (loading) return null;

  const call = tooDeep ? null : decodeCalldata(data);
  const contractRow = (
    <View style={styles.row}>
      <AddressInfoRow
        label="Contract"
        value={callee ? checksumEthAddress(callee) : '—'}
      />
    </View>
  );

  if (descriptor || (call && call.kind !== 'unknown-call')) {
    return (
      <>
        {/* A token call's own section names the contract as "Token contract". */}
        {!(call && isTokenCall(call)) && contractRow}
        <DecodedCallSection
          call={call ?? { kind: 'unknown-call', selector: data.slice(0, 10) }}
          tokenContract={callee}
          chainId={chainId}
          descriptor={descriptor}
          depth={depth}
        />
      </>
    );
  }
  return (
    <>
      {contractRow}
      <View style={styles.row}>
        <InfoRow label="Contract call" value={data.slice(0, 10)} />
      </View>
      <View style={styles.row}>
        <InfoRow label="Data" value={data} />
      </View>
    </>
  );
}

function pick(
  params: Record<string, unknown> | undefined,
  pathKey: string,
  valueKey: string,
  each: (path: string) => string[],
): string[] {
  const path = params?.[pathKey];
  if (typeof path === 'string') return each(path);
  const value = params?.[valueKey];
  return typeof value === 'string' || typeof value === 'number'
    ? [String(value)]
    : [];
}

/** A `calldata` field: every call it holds, each with its own entry or the app's decoding. */
export default function Eip7730InnerCalls({
  field,
  ctx,
}: {
  field: Eip7730Field;
  ctx: Eip7730FieldContext;
}) {
  const each =
    ctx.resolveEach ??
    ((path: string) => {
      const value = ctx.resolvePath(path);
      return value === null ? [] : [value];
    });
  const calls = field.value !== undefined ? [field.value] : each(field.path);
  const callees = pick(field.params, 'calleePath', 'callee', each);
  const amounts = pick(field.params, 'amountPath', 'amount', each);
  const spenders = pick(field.params, 'spenderPath', 'spender', each);
  const chainIds = pick(field.params, 'chainIdPath', 'chainId', each);
  // One value applies to every call; a list pairs with the calls by position.
  const at = (list: string[], i: number) =>
    list.length === 1 ? list[0] : list[i];
  const depth = (ctx.depth ?? 0) + 1;

  if (calls.length === 0) {
    return (
      <View style={styles.row}>
        <InfoRow label={field.label} value="—" />
      </View>
    );
  }
  return (
    <View>
      <SectionHeader title={field.label} />
      {calls.map((data, i) => {
        const chainId = Number(at(chainIds, i) ?? ctx.chainId);
        return (
          <View key={`${i}-${data.slice(0, 10)}`} style={styles.call}>
            {calls.length > 1 && (
              <Text variant="labelSmall" style={styles.count}>
                {`Call ${i + 1} of ${calls.length}`}
              </Text>
            )}
            <InnerCall
              data={data}
              callee={at(callees, i)}
              chainId={Number.isSafeInteger(chainId) ? chainId : undefined}
              amount={at(amounts, i)}
              spender={at(spenders, i)}
              depth={depth}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
  },
  call: {
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.surfaceVariant,
    paddingLeft: 12,
    marginVertical: 4,
  },
  count: {
    color: theme.colors.onSurfaceVariant,
    paddingTop: 4,
  },
});
