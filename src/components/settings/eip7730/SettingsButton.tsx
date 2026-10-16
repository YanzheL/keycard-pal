import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import theme from '@/theme';

type Props = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
};

export default function SettingsButton({
  label,
  onPress,
  busy,
  disabled,
  testID,
}: Props) {
  const inactive = busy || disabled;
  return (
    <Pressable
      style={[styles.button, inactive && styles.buttonDisabled]}
      android_ripple={{ color: theme.colors.ripple }}
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      // The spinner replaces the label, so the name has to come from here.
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
    >
      {busy ? (
        <ActivityIndicator color={theme.colors.primary} />
      ) : (
        <Text variant="labelLarge" style={styles.label}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  label: {
    color: theme.colors.primary,
  },
});
