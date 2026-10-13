import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import Eip7730FieldRow from '@/components/SignRequestDetail/eth/DataTabPanel/Eip7730FieldRow';

import { interpolateIntent } from '@/utils/eip7730/format';
import type { Eip7730DisplayFormat } from '@/utils/eip7730/zip';

type Props = {
  format: Eip7730DisplayFormat;
  resolvePath: (path: string) => string | null;
  resolveEach?: (path: string) => string[];
  contractAddress?: string;
  chainId?: number;
  depth?: number;
};

export default function Eip7730CallSection({
  format,
  resolvePath,
  resolveEach,
  contractAddress,
  chainId,
  depth = 0,
}: Props) {
  const ctx = { chainId, contractAddress, resolvePath, resolveEach, depth };
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
      {format.fields.map((field, index) => (
        <Eip7730FieldRow
          key={`${field.path}-${index}`}
          field={field}
          format={format}
          ctx={ctx}
        />
      ))}
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
