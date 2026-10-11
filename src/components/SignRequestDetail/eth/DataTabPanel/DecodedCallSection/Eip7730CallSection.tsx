import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import Eip7730FieldRow from '@/components/SignRequestDetail/eth/DataTabPanel/Eip7730FieldRow';

import {
  buildCalldataPathResolver,
  type Eip7730Container,
} from '@/utils/eip7730/paths';
import type { Eip7730DisplayFormat } from '@/utils/eip7730/zip';
import type { DecodedCall } from '@/utils/txParser';

type Props = {
  format: Eip7730DisplayFormat;
  call: DecodedCall;
  contractAddress?: string;
  chainId?: number;
  container?: Eip7730Container;
};

export default function Eip7730CallSection({
  format,
  call,
  contractAddress,
  chainId,
  container,
}: Props) {
  const ctx = {
    chainId,
    contractAddress,
    resolvePath: buildCalldataPathResolver(call, container),
  };

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
