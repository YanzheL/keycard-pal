import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import theme from '@/theme';

import AddressInfoRow from '@/components/ens/AddressInfoRow.online';
import InfoRow from '@/components/InfoRow';

import {
  formatEip7730Field,
  type Eip7730FieldContext,
} from '@/utils/eip7730/format';
import type { Eip7730DisplayFormat, Eip7730Field } from '@/utils/eip7730/zip';

export default function Eip7730FieldRow({
  field,
  format,
  ctx,
}: {
  field: Eip7730Field;
  format: Eip7730DisplayFormat;
  ctx: Eip7730FieldContext;
}) {
  const raw = ctx.resolvePath(field.path);
  if (field.format === 'addressName' && raw?.startsWith('0x')) {
    return (
      <View style={styles.row}>
        <AddressInfoRow label={field.label} value={raw} />
      </View>
    );
  }
  const { text, warning } = formatEip7730Field(field, raw, format, ctx);
  return (
    <>
      <View style={styles.row}>
        <InfoRow label={field.label} value={text} />
      </View>
      {warning && (
        <View style={styles.warningRow}>
          <Icon source="alert" size={16} color={theme.colors.negative} />
          <Text variant="labelSmall" style={styles.warningText}>
            {warning}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  warningText: {
    color: theme.colors.negative,
    flexShrink: 1,
  },
});
