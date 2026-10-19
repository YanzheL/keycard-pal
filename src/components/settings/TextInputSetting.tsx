import { useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardTypeOptions,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';

import theme from '../../theme';

import { useFieldFocus, type SettingsField } from './fieldFocus';

export default function TextInputSetting({
  label,
  value,
  dirty,
  saving,
  error,
  placeholder,
  keyboardType,
  disableSave,
  onChangeText,
  onRevert,
  onSave,
}: {
  label: string;
  value: string;
  dirty: boolean;
  saving?: boolean;
  error?: string | null;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  disableSave?: boolean;
  onChangeText: (v: string) => void;
  onRevert?: () => void;
  onSave: () => void;
}) {
  const blockRef = useRef<SettingsField>(null);
  const focused = useRef(false);
  const onFieldFocus = useFieldFocus();
  const handleFocus = useCallback(() => {
    focused.current = true;
    onFieldFocus(blockRef.current);
  }, [onFieldFocus]);
  const handleBlur = useCallback(() => {
    focused.current = false;
  }, []);
  // Revert and Save appear after the field was scrolled into view.
  const handleLayout = useCallback(() => {
    if (focused.current) onFieldFocus(blockRef.current);
  }, [onFieldFocus]);

  return (
    <View ref={blockRef} onLayout={handleLayout} style={styles.block}>
      <Text variant="bodySmall" style={styles.label}>
        {label}
      </Text>
      <TextInput
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        keyboardType={keyboardType}
        editable={!saving}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {(dirty || saving) && (
        <View style={styles.buttonRow}>
          {dirty && !saving && onRevert && (
            <Text style={styles.revertButton} onPress={onRevert}>
              Revert
            </Text>
          )}
          <Text
            style={[
              styles.saveButton,
              (saving || disableSave) && styles.saveButtonDisabled,
            ]}
            onPress={saving || disableSave ? undefined : onSave}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              'Save'
            )}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // The sections space their rows by 8, which this block keeps inside itself.
  block: {
    gap: 8,
  },
  label: {
    color: theme.colors.onSurfaceVariant,
  },
  input: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.onSurface,
    fontFamily: 'monospace',
    fontSize: 14,
  },
  error: {
    color: theme.colors.error,
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  revertButton: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 14,
  },
  saveButton: {
    color: theme.colors.primary,
    fontSize: 14,
  },
  saveButtonDisabled: {
    color: theme.colors.onSurfaceDisabled,
  },
});
