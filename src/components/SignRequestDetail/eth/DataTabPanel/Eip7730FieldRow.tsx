import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import AddressInfoRow from '@/components/ens/AddressInfoRow.online';
import InfoRow from '@/components/InfoRow';

import {
  describeAddress,
  describeTokenTicker,
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
      <View style={styles.row}>
        {shown.address ? (
          <AddressInfoRow
            label={label}
            value={shown.address}
            ens={shown.ens}
            name={
              shown.token && (
                <TokenSymbolRow token={shown.token} style={styles.name} />
              )
            }
          />
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
    raw === null
      ? null
      : field.format === 'addressName'
      ? describeAddress(field, raw, format, ctx)
      : field.format === 'tokenTicker'
      ? describeTokenTicker(field, raw, format, ctx)
      : null;
  if (shown) return <AddressNameRows label={field.label} shown={shown} />;
  const {
    text,
    warnings = [],
    ...rest
  } = formatEip7730Field(field, raw, format, ctx);
  const unknownTokenAddress =
    rest.unknownTokenAddress !== ctx.shownContract?.toLowerCase()
      ? rest.unknownTokenAddress
      : undefined;
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
  name: {
    paddingVertical: 0,
  },
  caption: {
    color: theme.colors.onSurfaceVariant,
    paddingTop: 4,
  },
});
