import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import TextInputSetting from '../src/components/settings/TextInputSetting';
import { FieldFocusContext } from '../src/components/settings/fieldFocus';

function renderField(onFieldFocus: jest.Mock) {
  return render(
    <FieldFocusContext.Provider value={onFieldFocus}>
      <TextInputSetting
        label="Project ID"
        value="abc"
        dirty={false}
        placeholder="Enter WalletConnect Project ID"
        onChangeText={jest.fn()}
        onSave={jest.fn()}
      />
    </FieldFocusContext.Provider>,
  );
}

describe('TextInputSetting', () => {
  // The screen owns the ScrollView, so it is the only one that can scroll a
  // focused field clear of the keyboard: the field has to hand itself over.
  it('hands its field block to the field-focus context on focus', () => {
    const onFieldFocus = jest.fn();
    renderField(onFieldFocus);

    fireEvent(
      screen.getByPlaceholderText('Enter WalletConnect Project ID'),
      'focus',
    );

    expect(onFieldFocus).toHaveBeenCalledTimes(1);
    expect(onFieldFocus.mock.calls[0][0]).toBeTruthy();
  });

  // Revert and Save appear under the field after it was scrolled into view.
  it('hands itself over again when its layout changes while focused', () => {
    const onFieldFocus = jest.fn();
    renderField(onFieldFocus);
    const input = screen.getByPlaceholderText('Enter WalletConnect Project ID');

    fireEvent(input, 'focus');
    fireEvent(screen.root, 'layout', { nativeEvent: { layout: {} } });

    expect(onFieldFocus).toHaveBeenCalledTimes(2);
    expect(onFieldFocus.mock.calls[1][0]).toBe(onFieldFocus.mock.calls[0][0]);
  });

  it('stays put on a layout change once it has lost focus', () => {
    const onFieldFocus = jest.fn();
    renderField(onFieldFocus);
    const input = screen.getByPlaceholderText('Enter WalletConnect Project ID');

    fireEvent(screen.root, 'layout', { nativeEvent: { layout: {} } });
    fireEvent(input, 'focus');
    fireEvent(input, 'blur');
    fireEvent(screen.root, 'layout', { nativeEvent: { layout: {} } });

    expect(onFieldFocus).toHaveBeenCalledTimes(1);
  });

  it('renders without a provider', () => {
    render(
      <TextInputSetting
        label="Project ID"
        value="abc"
        dirty={false}
        onChangeText={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(screen.getByDisplayValue('abc')).toBeTruthy();
  });
});
