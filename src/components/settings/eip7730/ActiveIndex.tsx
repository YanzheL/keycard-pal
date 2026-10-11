import { useCallback, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import SettingsButton from './SettingsButton';

import { getRuntimeIndex, subscribeRuntimeIndex } from '@/utils/eip7730/lookup';
import { revertToBundledIndex } from '@/utils/eip7730/restore';

type Props = {
  onReverted?: () => Promise<void>;
  disabled?: boolean;
};

export default function ActiveIndex({ onReverted, disabled }: Props) {
  const index = useSyncExternalStore(subscribeRuntimeIndex, getRuntimeIndex);
  const [busy, setBusy] = useState(false);

  const handleRevert = useCallback(async () => {
    setBusy(true);
    try {
      await revertToBundledIndex();
      await onReverted?.();
    } finally {
      setBusy(false);
    }
  }, [onReverted]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Text variant="bodySmall" style={styles.label}>
          Last updated
        </Text>
        <Text variant="bodySmall" style={styles.value}>
          {index
            ? new Date(index.generatedAt).toLocaleString()
            : 'Bundled (default)'}
        </Text>
      </View>
      {index && (
        <SettingsButton
          label="Use bundled descriptors"
          onPress={handleRevert}
          busy={busy}
          disabled={disabled}
          testID="eip7730-use-bundled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: theme.colors.onSurfaceVariant,
  },
  value: {
    color: theme.colors.onSurface,
  },
});
