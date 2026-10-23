import React from 'react';
import { View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { EdgeInsets } from 'react-native-safe-area-context';

import theme from '@/theme';

import styles from './styles';

export default function ApprovingPhase({
  insets,
  sheet,
}: {
  insets: EdgeInsets;
  /** The Keycard sheet from useKeycardScreen. */
  sheet: React.ReactNode;
}) {
  return (
    <>
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.statusText}>Tap Keycard to connect…</Text>
      </View>
      {sheet}
    </>
  );
}
