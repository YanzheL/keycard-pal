import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import ActiveIndex from './ActiveIndex';
import ImportRegistryButton from './ImportRegistryButton';

import type { SatisfiesOnline } from '@/utils/onlineParity';

export default function Eip7730SettingsSection() {
  return (
    <View style={styles.section}>
      <Text variant="titleMedium" style={styles.header}>
        Clear Signing Descriptors
      </Text>
      <ImportRegistryButton />
      <ActiveIndex />
      <Text style={styles.helper}>
        On another device, download the clear-signing registry zip from
        github.com/ethereum/clear-signing-erc7730-registry, then import it here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  header: {
    color: theme.colors.onSurface,
  },
  helper: {
    color: theme.colors.onSurfaceMuted,
    fontSize: 12,
  },
});

// tsc drift guard: this stub must stay interface-compatible with its online twin.
export type _OnlineParity = SatisfiesOnline<
  typeof import('./Eip7730SettingsSection.online'),
  typeof import('./Eip7730SettingsSection.offline')
>;
