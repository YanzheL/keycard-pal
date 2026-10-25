import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedButtons } from 'react-native-paper';

import { EIP712_DIGEST_EXPLAINER } from '@/constants/erc8213';
import type { EthSignRequest } from '@/types';

import InfoRow from '@/components/InfoRow';

import type { EthPayload } from '@/utils/ethPayload';

import { DigestExplainer, DigestRow, SectionHeader } from './shared';

type Tab = 'details' | 'digests' | 'raw';

export default function Eip712PrehashedPanel({
  payload,
  request,
}: {
  payload: Extract<EthPayload, { kind: 'eip712-prehashed' }>;
  request: EthSignRequest;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const { prehashed, digest } = payload;

  return (
    <View style={styles.panel}>
      <SegmentedButtons
        value={tab}
        onValueChange={v => setTab(v as Tab)}
        buttons={[
          { value: 'details', label: 'Details' },
          { value: 'digests', label: 'Digests' },
          { value: 'raw', label: 'Raw' },
        ]}
      />
      <View style={styles.tabContent}>
        {tab === 'details' && (
          <>
            <SectionHeader title="EIP-712 (pre-hashed)" />
            <View style={styles.row}>
              <InfoRow
                label="Domain separator"
                value={prehashed.domainSeparatorHash}
              />
            </View>
            <View style={styles.row}>
              <InfoRow label="Message hash" value={prehashed.messageHash} />
            </View>
          </>
        )}
        {tab === 'digests' && (
          <>
            <DigestRow label="EIP-712 Digest" value={digest} />
            <DigestRow
              label="Domain Hash"
              value={prehashed.domainSeparatorHash}
            />
            <DigestRow label="Message Hash" value={prehashed.messageHash} />
            <DigestExplainer text={EIP712_DIGEST_EXPLAINER} />
          </>
        )}
        {tab === 'raw' && (
          <View style={styles.row}>
            <InfoRow label="Data" value={request.signData} />
          </View>
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
