import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import Eip7730FieldList from '@/components/SignRequestDetail/eth/DataTabPanel/Eip7730FieldList';
import {
  DescriptorReviewLine,
  DescriptorSourceLine,
} from '@/components/SignRequestDetail/eth/DataTabPanel/shared';

import { interpolateIntent } from '@/utils/eip7730/format';
import type { Eip7730DisplayFormat } from '@/utils/eip7730/zip';

type Props = {
  format: Eip7730DisplayFormat;
  resolvePath: (path: string) => string | null;
  resolveEach?: (path: string) => string[];
  contractAddress?: string;
  chainId?: number;
  depth?: number;
  shownContract?: string;
};

export default function Eip7730CallSection({
  format,
  resolvePath,
  resolveEach,
  contractAddress,
  chainId,
  depth = 0,
  shownContract,
}: Props) {
  const ctx = {
    chainId,
    contractAddress,
    resolvePath,
    resolveEach,
    depth,
    shownContract,
  };
  const title = interpolateIntent(format, ctx) ?? format.intent;

  return (
    <View>
      {title && (
        <View style={styles.intentRow}>
          <Text variant="titleSmall" style={styles.intent}>
            {title}
          </Text>
        </View>
      )}
      {depth === 0 ? (
        <DescriptorSourceLine reviewedBy={format.reviewedBy} />
      ) : (
        // An inner call's descriptor is another file, reviewed or not on its own.
        <DescriptorReviewLine reviewedBy={format.reviewedBy} />
      )}
      <Eip7730FieldList fields={format.fields} format={format} ctx={ctx} />
    </View>
  );
}

const styles = StyleSheet.create({
  intentRow: {
    paddingVertical: 8,
  },
  intent: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
});
