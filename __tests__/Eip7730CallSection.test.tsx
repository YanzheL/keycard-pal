import React from 'react';
import { render, screen } from '@testing-library/react-native';

import Eip7730CallSection from '../src/components/SignRequestDetail/eth/DataTabPanel/DecodedCallSection/Eip7730CallSection';

import type { Eip7730DisplayFormat } from '../src/utils/eip7730/zip';
import type { DecodedCall } from '../src/utils/txParser';

jest.mock('../src/utils/tokenMetadata', () => ({
  lookupToken: jest.fn().mockReturnValue({ symbol: 'USDC', decimals: 6 }),
}));

jest.mock('../src/components/ens/AddressInfoRow.online', () => {
  const { View, Text } = require('react-native');
  return function MockAddressInfoRow({
    label,
    value,
  }: {
    label: string;
    value: string;
  }) {
    return (
      <View testID={`address-${label}`}>
        <Text>{label}</Text>
        <Text>{value}</Text>
      </View>
    );
  };
});

describe('Eip7730CallSection', () => {
  it('renders intent string when present', () => {
    const format: Eip7730DisplayFormat = {
      intent: 'Send USDC',
      fields: [],
    };
    const call: DecodedCall = {
      kind: 'erc20-transfer',
      to: '0xabc',
      amount: 1n,
    };
    render(<Eip7730CallSection format={format} call={call} />);
    expect(screen.getByText('Send USDC')).toBeTruthy();
  });

  it('renders an AddressInfoRow for addressName fields', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: 'to', label: 'Recipient', format: 'addressName' }],
    };
    const call: DecodedCall = {
      kind: 'erc20-transfer',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      amount: 1n,
    };
    render(<Eip7730CallSection format={format} call={call} />);
    expect(screen.getByTestId('address-Recipient')).toBeTruthy();
    expect(
      screen.getByText('0x1234567890abcdef1234567890abcdef12345678'),
    ).toBeTruthy();
  });

  const TOKEN = '0x000000000000000000000000000000000000feed';

  it('formats tokenAmount with the token from the transaction', () => {
    const format: Eip7730DisplayFormat = {
      fields: [
        {
          path: 'amount',
          label: 'Amount',
          format: 'tokenAmount',
          params: { tokenPath: '@.to' },
        },
      ],
      metadata: { tokens: { [TOKEN]: { decimals: 6, ticker: 'USDC' } } },
    };
    const call: DecodedCall = {
      kind: 'erc20-transfer',
      to: '0x0000000000000000000000000000000000000abc',
      amount: 1500000n,
    };
    render(
      <Eip7730CallSection
        format={format}
        call={call}
        contractAddress={TOKEN}
        chainId={1}
        container={{ to: TOKEN, chainId: 1 }}
      />,
    );
    expect(screen.getByText('1.5 USDC')).toBeTruthy();
    expect(screen.queryByText('Unknown token')).toBeNull();
  });

  it('warns when the token is unknown', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: 'amount', label: 'Amount', format: 'tokenAmount' }],
    };
    const call: DecodedCall = {
      kind: 'erc20-transfer',
      to: '0x0000000000000000000000000000000000000abc',
      amount: 1500000n,
    };
    render(
      <Eip7730CallSection
        format={format}
        call={call}
        contractAddress={TOKEN}
        chainId={1}
      />,
    );
    expect(screen.getByText('1500000')).toBeTruthy();
    expect(screen.getByText('Unknown token')).toBeTruthy();
  });

  it('formats the transaction value from the container', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: '@.value', label: 'Value', format: 'amount' }],
    };
    const call: DecodedCall = {
      kind: 'contract-call',
      selector: '0xdeadbeef',
      functionName: 'deposit',
      signature: 'deposit()',
      args: [],
    };
    render(
      <Eip7730CallSection
        format={format}
        call={call}
        chainId={1}
        container={{ value: '2000000000000000', chainId: 1 }}
      />,
    );
    expect(screen.getByText('0.002 ETH')).toBeTruthy();
  });

  it('renders em-dash for unresolved field paths', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: 'missingField', label: 'Missing', format: 'raw' }],
    };
    const call: DecodedCall = {
      kind: 'contract-call',
      selector: '0xdeadbeef',
      functionName: 'doStuff',
      signature: 'doStuff()',
      args: [],
    };
    render(<Eip7730CallSection format={format} call={call} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});
