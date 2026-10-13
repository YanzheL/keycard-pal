import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import EnsAddressLabel from './EnsAddressLabel.online';
import InfoRow from '../InfoRow';

import AddressText, { isDisplayAddress } from '../AddressText';
import theme from '../../theme';

export default function AddressInfoRow({
  label,
  value,
  ens = true,
}: {
  label: string;
  value: string;
  /** False where a clear-signing descriptor rules out ENS as a name source. */
  ens?: boolean;
}) {
  if (isDisplayAddress(value)) {
    return (
      <View style={styles.infoRow}>
        <Text variant="bodySmall" style={styles.infoLabel}>
          {label}
        </Text>
        {ens ? (
          <EnsAddressLabel address={value} />
        ) : (
          <AddressText address={value} style={styles.address} />
        )}
      </View>
    );
  }

  return <InfoRow label={label} value={value} />;
}

const styles = StyleSheet.create({
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    color: theme.colors.onSurfaceVariant,
  },
  address: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: theme.colors.onSurface,
  },
});
