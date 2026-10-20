import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from '@react-native-community/blur';

type Props = {
  revealed: boolean;
  /** What a screen reader says in place of the secret while it is blurred. */
  hiddenLabel: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** A secret under a blur until revealed, hidden from screen readers too. */
export default function BlurredSecret({
  revealed,
  hiddenLabel,
  style,
  children,
}: Props) {
  return (
    <View style={style}>
      <View aria-hidden={!revealed}>{children}</View>
      {!revealed && (
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityLabel={hiddenLabel}
        >
          <BlurView
            style={StyleSheet.absoluteFill}
            blurType="dark"
            blurAmount={10}
          />
        </View>
      )}
    </View>
  );
}
