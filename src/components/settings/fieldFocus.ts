import { createContext, useContext, type ComponentRef } from 'react';
import type { View } from 'react-native';

/** The whole field block, Revert and Save included, not just its input. */
export type SettingsField = ComponentRef<typeof View>;
export type FieldFocusHandler = (field: SettingsField | null) => void;

/**
 * Lets a settings field hand itself to the screen that owns the ScrollView,
 * which is the only place that can scroll it clear of the keyboard. A context
 * rather than a prop because the fields sit three components deep.
 */
export const FieldFocusContext = createContext<FieldFocusHandler>(() => {});

export function useFieldFocus(): FieldFocusHandler {
  return useContext(FieldFocusContext);
}
