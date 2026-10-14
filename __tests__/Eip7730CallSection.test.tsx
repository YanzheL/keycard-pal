import React from 'react';
import { act, render, screen } from '@testing-library/react-native';

import Eip7730CallSection from '../src/components/SignRequestDetail/eth/DataTabPanel/DecodedCallSection/Eip7730CallSection';
import { UNLIMITED_APPROVAL_WARNING } from '../src/constants/approval';

import { setSavedIndex } from '../src/utils/eip7730/lookup';
import { buildArgsPathResolver } from '../src/utils/eip7730/paths';
import { BUNDLED_SOURCE_TEXT } from '../src/utils/eip7730/source';
import type { Eip7730DisplayFormat } from '../src/utils/eip7730/zip';

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

const RECIPIENT = '0x0000000000000000000000000000000000000abc';
const transfer = (amount: bigint) =>
  buildArgsPathResolver({ to: RECIPIENT, amount });

describe('Eip7730CallSection', () => {
  it('renders intent string when present', () => {
    const format: Eip7730DisplayFormat = {
      intent: 'Send USDC',
      fields: [],
    };
    render(<Eip7730CallSection format={format} resolvePath={transfer(1n)} />);
    expect(screen.getByText('Send USDC')).toBeTruthy();
  });

  it('shows the sentence in place of the intent, and the intent when it cannot be filled', () => {
    const format: Eip7730DisplayFormat = {
      intent: 'Send',
      interpolatedIntent: 'Send {amount} to {to}',
      fields: [
        { path: 'to', label: 'To', format: 'addressName' },
        { path: 'amount', label: 'Amount', format: 'raw' },
      ],
    };
    const { unmount } = render(
      <Eip7730CallSection format={format} resolvePath={transfer(7n)} />,
    );
    expect(
      screen.getByText('Send 7 to 0x0000000000000000000000000000000000000aBc'),
    ).toBeTruthy();
    expect(screen.queryByText('Send')).toBeNull();
    unmount();

    render(
      <Eip7730CallSection
        format={format}
        resolvePath={buildArgsPathResolver({ amount: 7n })}
      />,
    );
    expect(screen.getByText('Send')).toBeTruthy();
  });

  it('renders an AddressInfoRow for addressName fields', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: 'to', label: 'Recipient', format: 'addressName' }],
    };
    const resolvePath = buildArgsPathResolver({
      to: '0x1234567890abcdef1234567890abcdef12345678',
    });
    render(<Eip7730CallSection format={format} resolvePath={resolvePath} />);
    expect(screen.getByTestId('address-Recipient')).toBeTruthy();
    expect(
      screen.getByText('0x1234567890AbcdEF1234567890aBcdef12345678'),
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
    render(
      <Eip7730CallSection
        format={format}
        resolvePath={buildArgsPathResolver(
          { to: RECIPIENT, amount: 1500000n },
          { to: TOKEN, chainId: 1 },
        )}
        contractAddress={TOKEN}
        chainId={1}
      />,
    );
    expect(screen.getByText('1.5 USDC')).toBeTruthy();
    expect(screen.queryByText('Unknown token')).toBeNull();
  });

  it('warns when the token is unknown', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: 'amount', label: 'Amount', format: 'tokenAmount' }],
    };
    render(
      <Eip7730CallSection
        format={format}
        resolvePath={transfer(1500000n)}
        contractAddress={TOKEN}
        chainId={1}
      />,
    );
    expect(screen.getByText('1500000')).toBeTruthy();
    expect(screen.getByText('Unknown token')).toBeTruthy();
  });

  it('shows both warnings for an unlimited amount of an unknown token', () => {
    const format: Eip7730DisplayFormat = {
      fields: [
        {
          path: 'amount',
          label: 'Amount',
          format: 'tokenAmount',
          params: { threshold: '1000' },
        },
      ],
    };
    render(
      <Eip7730CallSection
        format={format}
        resolvePath={transfer(2n ** 256n - 1n)}
        contractAddress={TOKEN}
        chainId={1}
      />,
    );
    expect(screen.getByText('Unlimited')).toBeTruthy();
    expect(screen.getByText(UNLIMITED_APPROVAL_WARNING)).toBeTruthy();
    expect(screen.getByText('Unknown token')).toBeTruthy();
  });

  it('formats the transaction value from the container', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: '@.value', label: 'Value', format: 'amount' }],
    };
    render(
      <Eip7730CallSection
        format={format}
        resolvePath={buildArgsPathResolver(
          {},
          { value: '2000000000000000', chainId: 1 },
        )}
        chainId={1}
      />,
    );
    expect(screen.getByText('0.002 ETH')).toBeTruthy();
  });

  it('shows a fixed value without reading the call', () => {
    const format: Eip7730DisplayFormat = {
      fields: [
        { path: '', label: 'Share ticker', format: 'raw', value: 'kmmUSDC' },
      ],
    };
    render(
      <Eip7730CallSection
        format={format}
        resolvePath={buildArgsPathResolver({})}
      />,
    );
    expect(screen.getByText('kmmUSDC')).toBeTruthy();
  });

  it('renders em-dash for unresolved field paths', () => {
    const format: Eip7730DisplayFormat = {
      fields: [{ path: 'missingField', label: 'Missing', format: 'raw' }],
    };
    render(<Eip7730CallSection format={format} resolvePath={transfer(1n)} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
  it('leaves out the fields its visibility rules hide', () => {
    const format: Eip7730DisplayFormat = {
      fields: [
        {
          path: 'amount',
          label: 'Amount',
          format: 'raw',
          visible: { ifNotIn: ['0'] },
        },
        {
          path: 'to',
          label: 'To',
          format: 'raw',
          visible: { mustMatch: [RECIPIENT] },
        },
      ],
    };
    const { rerender } = render(
      <Eip7730CallSection format={format} resolvePath={transfer(0n)} />,
    );
    expect(screen.queryByText('Amount')).toBeNull();
    expect(screen.queryByText('To')).toBeNull();

    rerender(<Eip7730CallSection format={format} resolvePath={transfer(5n)} />);
    expect(screen.getByText('Amount')).toBeTruthy();
    expect(screen.queryByText('To')).toBeNull();
  });
  it('says where its entry came from on a top-level call, and follows a change of registry', () => {
    const format: Eip7730DisplayFormat = { intent: 'Send', fields: [] };
    render(<Eip7730CallSection format={format} resolvePath={transfer(1n)} />);
    expect(screen.getByText(BUNDLED_SOURCE_TEXT)).toBeTruthy();
    try {
      act(() =>
        setSavedIndex({
          generatedAt: '2026-10-13T12:00:00.000Z',
          source: 'import',
        }),
      );
      expect(screen.getByText(/^From a registry imported on /)).toBeTruthy();
    } finally {
      act(() => setSavedIndex(null));
    }
  });

  it('leaves the source to the top-level call', () => {
    const format: Eip7730DisplayFormat = { intent: 'Send', fields: [] };
    render(
      <Eip7730CallSection
        format={format}
        resolvePath={transfer(1n)}
        depth={1}
      />,
    );
    expect(screen.queryByTestId('descriptor-source')).toBeNull();
  });
});
