import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import AddressInfoRowOffline from '../src/components/ens/AddressInfoRow.offline';
import AddressInfoRow from '../src/components/ens/AddressInfoRow.online';

const mockUseEnsName = jest.fn();

jest.mock('../src/hooks/ens/useEnsName.online', () => ({
  useEnsName: (address: string) => mockUseEnsName(address),
}));

const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

beforeEach(() => {
  mockUseEnsName.mockReset();
  mockUseEnsName.mockReturnValue({
    name: 'vitalik.eth',
    loading: false,
    error: false,
    retry: jest.fn(),
  });
});

describe('AddressInfoRow', () => {
  it('names an address through ENS by default', () => {
    render(<AddressInfoRow label="To" value={address} />);
    expect(screen.getByText('vitalik.eth')).toBeTruthy();
    expect(mockUseEnsName).toHaveBeenCalledWith(address);
  });

  it('never looks the address up when ENS is ruled out', () => {
    render(<AddressInfoRow label="Spender" value={address} ens={false} />);
    expect(screen.getByText('Spender')).toBeTruthy();
    expect(screen.getByText(address)).toBeTruthy();
    expect(screen.queryByText('vitalik.eth')).toBeNull();
    expect(mockUseEnsName).not.toHaveBeenCalled();
  });

  it('shows a value that is no address as a plain row', () => {
    render(<AddressInfoRow label="Note" value="hello" ens={false} />);
    expect(screen.getByText('hello')).toBeTruthy();
  });

  it('the offline row takes the same props and shows the address', () => {
    render(<AddressInfoRowOffline label="To" value={address} ens={false} />);
    expect(screen.getByText(address)).toBeTruthy();
  });
  it('shows a name between the label and the address, on both builds', () => {
    for (const Row of [AddressInfoRow, AddressInfoRowOffline]) {
      const { toJSON, unmount } = render(
        <Row
          label="Maker asset"
          value={address}
          ens={false}
          name={<Text>USDC</Text>}
        />,
      );
      const text = JSON.stringify(toJSON());
      const at = (s: string) => text.indexOf(s);
      expect(at('Maker asset')).toBeGreaterThan(-1);
      expect(at('Maker asset')).toBeLessThan(at('USDC'));
      expect(at('USDC')).toBeLessThan(at('d8dA'));
      unmount();
    }
  });

  it('passes the name on for a value that is no address', () => {
    render(
      <AddressInfoRow label="Note" value="hello" name={<Text>named</Text>} />,
    );
    expect(screen.getByText('named')).toBeTruthy();
  });
});
