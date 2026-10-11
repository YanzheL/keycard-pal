import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

import SettingsButton from './SettingsButton';

import { importRegistryZipFromPicker } from '@/utils/eip7730/import';

export default function ImportRegistryButton({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await importRegistryZipFromPicker();
      if (!result.ok && result.reason === 'invalid') {
        setError('This file is not a clear-signing registry zip.');
      } else if (!result.ok && result.reason === 'unreadable') {
        setError('Could not read the selected file.');
      } else if (!result.ok && result.reason === 'unsaved') {
        setError(
          'Could not save the descriptors. Check free storage and try again.',
        );
      }
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <View style={styles.wrapper}>
      <SettingsButton
        label="Import registry zip"
        onPress={handlePress}
        busy={busy}
        disabled={disabled}
        testID="eip7730-import-button"
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 4,
  },
  error: {
    color: theme.colors.error,
    fontSize: 12,
  },
});
