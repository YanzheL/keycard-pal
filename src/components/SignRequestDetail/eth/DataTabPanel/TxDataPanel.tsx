import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

import { CALLDATA_DIGEST_EXPLAINER } from '@/constants/erc8213';
import type { EthSignRequest } from '@/types';

import InfoRow from '@/components/InfoRow';

import { useEip7730Format } from '@/hooks/useEip7730Format';

import { lookupCalldata } from '@/utils/eip7730/lookup';
import {
  buildArgsPathResolver,
  decodeArgsBySignature,
} from '@/utils/eip7730/paths';
import { computeCalldataDigest } from '@/utils/erc8213';
import type { ParsedTx } from '@/utils/txParser';

import { DigestExplainer, DigestRow } from './shared';
import DecodedCallSection, {
  type MatchedDescriptor,
} from './DecodedCallSection';
import SimulationPanel from './SimulationPanel';
import { useSimulation } from './useSimulation';

type Tab = 'decoded' | 'digests' | 'raw' | 'simulation';

export default function TxDataPanel({
  tx,
  request,
  chainId,
}: {
  tx: ParsedTx;
  request: EthSignRequest;
  chainId: number | undefined;
}) {
  const calldata = tx.data ?? '';
  const selector = calldata.length >= 10 ? calldata.slice(0, 10) : null;

  const lookup = useCallback(
    () =>
      chainId !== undefined && tx.to && selector
        ? lookupCalldata(chainId, tx.to, selector)
        : null,
    [chainId, tx.to, selector],
  );
  const { format, loading } = useEip7730Format(lookup);

  const descriptor = useMemo<MatchedDescriptor | null>(() => {
    if (!format?.signature) return null;
    // An entry whose signature does not fit the bytes is not describing this call.
    const args = decodeArgsBySignature(format.signature, calldata);
    if (!args) return null;
    const container = {
      from: request.address,
      to: tx.to,
      value: tx.valueWei,
      chainId,
    };
    return { format, resolvePath: buildArgsPathResolver(args, container) };
  }, [format, calldata, request.address, tx.to, tx.valueWei, chainId]);

  const hasDecodedCall =
    descriptor !== null ||
    (tx.decodedCall !== undefined && tx.decodedCall.kind !== 'unknown-call');
  const [chosenTab, setTab] = useState<Tab | null>(null);

  const { showSimulationTab, simulationState, handleSimulate } = useSimulation(
    request,
    tx,
    chainId,
  );

  const calldataDigest = useMemo(
    () => computeCalldataDigest(calldata),
    [calldata],
  );

  const defaultTab: Tab = hasDecodedCall ? 'decoded' : 'digests';
  const tab: Tab =
    chosenTab === null ||
    (chosenTab === 'decoded' && !hasDecodedCall) ||
    (chosenTab === 'simulation' && !showSimulationTab)
      ? defaultTab
      : chosenTab;

  // The tabs depend on the entry, and a saved slice takes only milliseconds to read.
  if (loading) return null;

  const buttons = [
    ...(hasDecodedCall ? [{ value: 'decoded', label: 'Decoded' }] : []),
    { value: 'digests', label: 'Digests' },
    { value: 'raw', label: 'Raw' },
    ...(showSimulationTab
      ? [{ value: 'simulation', label: 'Simulation' }]
      : []),
  ];

  return (
    <View style={styles.panel}>
      <SegmentedButtons
        value={tab}
        onValueChange={v => setTab(v as Tab)}
        buttons={buttons}
      />
      <View style={styles.tabContent}>
        {tab === 'decoded' && tx.decodedCall && (
          <DecodedCallSection
            call={tx.decodedCall}
            tokenContract={tx.to}
            chainId={chainId}
            descriptor={descriptor}
          />
        )}
        {tab === 'digests' && calldataDigest && (
          <>
            <DigestRow label="Calldata Digest" value={calldataDigest} />
            <DigestExplainer text={CALLDATA_DIGEST_EXPLAINER} />
          </>
        )}
        {tab === 'raw' && (
          <View style={styles.row}>
            <InfoRow label="Data" value={request.signData} />
          </View>
        )}
        {tab === 'simulation' && showSimulationTab && (
          <SimulationPanel
            state={simulationState}
            onSimulate={handleSimulate}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 8,
  },
  tabContent: {
    paddingTop: 8,
  },
  row: {
    paddingVertical: 8,
  },
});
