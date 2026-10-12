import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import Eip7730FieldRow from '@/components/SignRequestDetail/eth/DataTabPanel/Eip7730FieldRow';

import type { Eip7730DisplayFormat } from '@/utils/eip7730/zip';

type Props = {
  format: Eip7730DisplayFormat;
  resolvePath: (path: string) => string | null;
  contractAddress?: string;
  chainId?: number;
};

export default function Eip7730CallSection({
  format,
  resolvePath,
  contractAddress,
  chainId,
}: Props) {
  const ctx = { chainId, contractAddress, resolvePath };

  return (
    <View>
      {format.intent && (
        <View style={styles.intentRow}>
          <Text variant="titleSmall" style={styles.intent}>
            {format.intent}
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
