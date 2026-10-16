import React from 'react';
import { render, screen } from '@testing-library/react-native';

import Eip7730DownloadProgress from '../src/components/Eip7730DownloadProgress.online';

const mockUseDownload = jest.fn();

jest.mock('../src/hooks/useEip7730Download.online', () => ({
  useEip7730Download: () => mockUseDownload(),
}));

beforeEach(() => jest.clearAllMocks());

describe('Eip7730DownloadProgress', () => {
  it('renders nothing while idle', () => {
    mockUseDownload.mockReturnValue({
      phase: 'idle',
      triggerDownload: () => {},
    });
    const { toJSON } = render(<Eip7730DownloadProgress />);
    expect(toJSON()).toBeNull();
  });

  it('renders progress bar with label when downloading', () => {
    mockUseDownload.mockReturnValue({
      phase: 'downloading',
      progress: 0.5,
      triggerDownload: () => {},
    });
    render(<Eip7730DownloadProgress />);
    expect(screen.getByTestId('eip7730-progress')).toBeTruthy();
    expect(screen.getByText(/Downloading descriptors/i)).toBeTruthy();
  });

  it('labels each busy phase, with a moving bar while the size is unknown', () => {
    for (const [phase, label] of [
      ['checking', 'Checking for descriptor updates…'],
      ['processing', 'Processing descriptors…'],
    ]) {
      mockUseDownload.mockReturnValue({ phase, triggerDownload: () => {} });
      const { unmount, UNSAFE_getByProps } = render(
        <Eip7730DownloadProgress />,
      );
      expect(screen.getByText(label)).toBeTruthy();
      expect(UNSAFE_getByProps({ indeterminate: true })).toBeTruthy();
      unmount();
    }
  });

  it('renders nothing when phase is done', () => {
    mockUseDownload.mockReturnValue({
      phase: 'done',
      triggerDownload: () => {},
    });
    const { toJSON } = render(<Eip7730DownloadProgress />);
    expect(toJSON()).toBeNull();
  });
});
