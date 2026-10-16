import { StyleSheet, View } from 'react-native';
import { ProgressBar, Text } from 'react-native-paper';

import type { Eip7730DownloadPhase } from '@/providers/eip7730/context';
import theme from '@/theme';

import { useEip7730Download } from '@/hooks/useEip7730Download.online';

const LABELS: Partial<Record<Eip7730DownloadPhase, string>> = {
  checking: 'Checking for descriptor updates…',
  downloading: 'Downloading descriptors…',
  processing: 'Processing descriptors…',
};

export default function Eip7730DownloadProgress() {
  const { phase, progress } = useEip7730Download();
  const label = LABELS[phase];
  if (!label) return null;
  return (
    <View style={styles.wrapper} testID="eip7730-progress">
      <Text variant="bodySmall" style={styles.label}>
        {label}
      </Text>
      <ProgressBar
        indeterminate={progress === undefined}
        progress={progress ?? 0}
        color={theme.colors.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  label: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 11,
  },
});
