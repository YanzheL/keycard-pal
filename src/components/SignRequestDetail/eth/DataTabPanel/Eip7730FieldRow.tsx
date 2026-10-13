import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import AddressInfoRow from '@/components/ens/AddressInfoRow.online';
import InfoRow from '@/components/InfoRow';

import {
  describeAddress,
  formatEip7730Field,
  SENDER_TEXT,
  type AddressNameDisplay,
  type Eip7730FieldContext,
} from '@/utils/eip7730/format';
import type { Eip7730DisplayFormat, Eip7730Field } from '@/utils/eip7730/zip';
import { checksumEthAddress } from '@/utils/ethereumAddress';

import TokenSymbolRow from './DecodedCallSection/TokenSymbolRow';
import Eip7730InnerCalls from './Eip7730InnerCalls';
import { WarningRow } from './shared';

export const SIGNER_CAPTION = 'The address signing this';

function AddressNameRows({
  label,
  shown,
}: {
  label: string;
  shown: AddressNameDisplay;
}) {
  return (
    <>
      {shown.token && <TokenSymbolRow token={shown.token} />}
      <View style={styles.row}>
        {shown.address ? (
          <AddressInfoRow label={label} value={shown.address} ens={shown.ens} />
        ) : (
          <InfoRow label={label} value={SENDER_TEXT} />
        )}
        {shown.sender && shown.address && (
          <Text variant="labelSmall" style={styles.caption}>
            {SIGNER_CAPTION}
          </Text>
        )}
      </View>
      {shown.warnings.map(warning => (
        <WarningRow key={warning} text={warning} />
      ))}
    </>
  );
}

export default function Eip7730FieldRow({
  field,
  format,
  ctx,
}: {
  field: Eip7730Field;
  format: Eip7730DisplayFormat;
  ctx: Eip7730FieldContext;
}) {
  if (field.format === 'calldata') {
    return <Eip7730InnerCalls field={field} ctx={ctx} />;
  }
  const raw = field.value ?? ctx.resolvePath(field.path);
  const shown =
    field.format === 'addressName' && raw !== null
      ? describeAddress(field, raw, format, ctx)
      : null;
  if (shown) return <AddressNameRows label={field.label} shown={shown} />;
  const {
    text,
    warnings = [],
    unknownTokenAddress,
  } = formatEip7730Field(field, raw, format, ctx);
  return (
    <>
      <View style={styles.row}>
        <InfoRow label={field.label} value={text} />
      </View>
      {warnings.map(warning => (
        <WarningRow key={warning} text={warning} />
      ))}
      {unknownTokenAddress && (
        <View style={styles.row}>
          <AddressInfoRow
            label="Token contract"
            value={checksumEthAddress(unknownTokenAddress)}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
  },
  caption: {
    color: theme.colors.onSurfaceVariant,
    paddingTop: 4,
  },
});
