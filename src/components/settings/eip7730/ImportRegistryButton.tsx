import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { IMPORT_SOURCE_WARNING } from '@/constants/eip7730';
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
      {/* Whoever made the file decides what the review screens say. */}
      <View style={styles.warning}>
        <Icon source="alert" size={16} color={theme.colors.negative} />
        <Text variant="labelSmall" style={styles.warningText}>
          {IMPORT_SOURCE_WARNING}
        </Text>
      </View>
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
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningText: {
    color: theme.colors.negative,
    flexShrink: 1,
  },
});
