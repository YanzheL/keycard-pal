import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedButtons, Text } from 'react-native-paper';

import { EIP712_DIGEST_EXPLAINER } from '@/constants/erc8213';
import type { EthSignRequest } from '@/types';
import theme from '@/theme';

import AddressInfoRow from '@/components/ens/AddressInfoRow.online';
import InfoRow from '@/components/InfoRow';

import {
  encodeEip712Type,
  parseEip712RawTypedData,
  type Eip712Summary,
} from '@/utils/eip712';
import type { Eip7730FieldContext } from '@/utils/eip7730/format';
import { lookupEip712 } from '@/utils/eip7730/lookup';
import { resolveEip712FieldValue } from '@/utils/eip7730/paths';
import { classifyEthPayload } from '@/utils/ethPayload';

import Eip7730FieldRow from './Eip7730FieldRow';
import { DigestExplainer, DigestRow, SectionHeader } from './shared';
import SpecialEip712Section from './SpecialEip712Section';

type Tab = 'details' | 'digests' | 'raw';

export default function Eip712JsonPanel({
  request,
  eip712,
  chainId,
}: {
  request: EthSignRequest;
  eip712: Eip712Summary;
  chainId: number | undefined;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const specialEip712 = eip712.special;

  // WalletConnect typed data is in reviewData; the app hashed it into signData itself.
  const rawTypedData = useMemo(
    () => parseEip712RawTypedData(request.reviewData ?? request.signData),
    [request.reviewData, request.signData],
  );
  const verifyingContract = eip712.domain?.verifyingContract;

  const eip7730Descriptor = useMemo(() => {
    if (chainId === undefined || !verifyingContract || !rawTypedData) {
      return null;
    }
    const encodedType = encodeEip712Type(
      rawTypedData.primaryType,
      rawTypedData.types,
    );
    if (!encodedType) return null;
    return lookupEip712(
      chainId,
      verifyingContract,
      encodedType,
      rawTypedData.domain,
    );
  }, [chainId, verifyingContract, rawTypedData]);

  const fieldContext = useMemo<Eip7730FieldContext>(() => {
    const container = {
      from: request.address,
      to: verifyingContract,
      value: '0',
      chainId,
    };
    return {
      chainId,
      contractAddress: verifyingContract,
      resolvePath: path =>
        resolveEip712FieldValue(path, rawTypedData?.message, container),
    };
  }, [chainId, verifyingContract, rawTypedData, request.address]);

  const eip712Digest = useMemo(() => {
    // Same classification as the bytes sent to the card, so the digest shown is the one signed.
    const payload = classifyEthPayload(request.signData, request.dataType);
    return payload.kind === 'eip712-json' || payload.kind === 'raw-digest'
      ? payload.digest
      : null;
  }, [request.signData, request.dataType]);

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
            {eip712.primaryType && (
              <View style={styles.row}>
                <InfoRow label="Primary type" value={eip712.primaryType} />
              </View>
            )}
            {Object.keys(eip712.domain).length > 0 && (
              <>
                <SectionHeader title="EIP-712 Domain" />
                {Object.entries(eip712.domain).map(([key, value]) => (
                  <View key={`domain-${key}`} style={styles.row}>
                    <AddressInfoRow label={key} value={value} />
                  </View>
                ))}
              </>
            )}
            {eip7730Descriptor ? (
              <>
                {eip7730Descriptor.intent && (
                  <View style={styles.row}>
                    <Text variant="titleSmall" style={styles.intent}>
                      {eip7730Descriptor.intent}
                    </Text>
                  </View>
                )}
                {eip7730Descriptor.fields.length > 0 && (
                  <SectionHeader title="Message" />
                )}
                {eip7730Descriptor.fields.map((field, index) => (
                  <Eip7730FieldRow
                    key={`eip7730-${field.path}-${index}`}
                    field={field}
                    format={eip7730Descriptor}
                    ctx={fieldContext}
                  />
                ))}
              </>
            ) : (
              <>
                {specialEip712 && (
                  <SpecialEip712Section
                    special={specialEip712}
                    fallbackChainId={chainId}
                  />
                )}
                {!specialEip712 && Object.keys(eip712.message).length > 0 && (
                  <>
                    <SectionHeader title="Message Fields" />
                    {Object.entries(eip712.message).map(([key, value]) => (
                      <View key={`message-${key}`} style={styles.row}>
                        <AddressInfoRow label={key} value={value} />
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
        {tab === 'digests' && eip712Digest && (
          <>
            <DigestRow label="EIP-712 Digest" value={eip712Digest} />
            <DigestExplainer text={EIP712_DIGEST_EXPLAINER} />
          </>
        )}
        {tab === 'raw' && (
          <View style={styles.row}>
            <InfoRow label="Data" value={eip712.rawJson} />
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
  intent: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
