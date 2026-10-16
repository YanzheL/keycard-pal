import { render, screen } from '@testing-library/react-native';
import React from 'react';

import SettingsButton from '../src/components/settings/eip7730/SettingsButton';

describe('SettingsButton', () => {
  it('is a button named by its label', () => {
    render(<SettingsButton label="Import registry zip" onPress={() => {}} />);
    expect(
      screen.getByRole('button', { name: 'Import registry zip' }),
    ).toBeTruthy();
  });

  it('keeps its name and says it is busy while the spinner replaces the label', () => {
    render(<SettingsButton label="Download now" onPress={() => {}} busy />);
    expect(screen.queryByText('Download now')).toBeNull();
    const button = screen.getByLabelText('Download now');
    expect(button.props.accessibilityState).toEqual({
      disabled: true,
      busy: true,
    });
  });
});
