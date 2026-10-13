import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { encodeFunctionData, parseAbiItem, type AbiFunction } from 'viem';

import Eip7730FieldList from '../src/components/SignRequestDetail/eth/DataTabPanel/Eip7730FieldList';
import { UNLIMITED_APPROVAL_WARNING } from '../src/constants/approval';
import type { Eip7730FieldContext } from '../src/utils/eip7730/format';
import {
  buildArgsEachResolver,
  buildArgsPathResolver,
} from '../src/utils/eip7730/paths';
import type {
  Eip7730DisplayFormat,
  Eip7730Field,
} from '../src/utils/eip7730/zip';

jest.mock('react-native-paper', () => {
  const { Text, View } = require('react-native');
  return {
    Text: ({ children, ...props }: any) => <Text {...props}>{children}</Text>,
    Icon: () => <View />,
  };
});

jest.mock('../src/theme', () => ({
  __esModule: true,
  default: {
    colors: {
      onSurfaceVariant: '#aaa',
      negative: '#f00',
      surfaceVariant: '#222',
      primary: '#f60',
    },
  },
}));

jest.mock('../src/components/InfoRow', () => {
  const { Text } = require('react-native');
  return ({ label, value }: { label: string; value: string }) => (
    <Text>{`${label}: ${value}`}</Text>
  );
});

jest.mock('../src/components/ens/AddressInfoRow.online', () => {
  const { Text } = require('react-native');
  return ({ label, value }: { label: string; value: string }) => (
    <Text>{`${label}: ${value}`}</Text>
  );
});

jest.mock('../src/utils/buildConfig', () => ({ INTERNET_ENABLED: false }));

jest.mock('../src/hooks/useTokenImagesEnabled.online', () => ({
  __esModule: true,
  default: () => false,
}));

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const RECIPIENT = '0xD3CDa913deb6F4967B2eF3Aa68F5a843da74c4Ef';
const MAX_160 = '0xffffffffffffffffffffffffffffffffffffffff';

function ctxFor(args: Record<string, unknown>): Eip7730FieldContext {
  const container = { to: RECIPIENT, chainId: 1 };
  return {
    chainId: 1,
    resolvePath: buildArgsPathResolver(args, container),
    resolveEach: buildArgsEachResolver(args, container),
    depth: 0,
  };
}

function renderList(fields: Eip7730Field[], args: Record<string, unknown>) {
  const format: Eip7730DisplayFormat = { fields };
  render(
    <Eip7730FieldList fields={fields} format={format} ctx={ctxFor(args)} />,
  );
}

const permitBatch: Eip7730Field[] = [
  { path: 'spender', label: 'Spender', format: 'raw' },
  {
    path: 'details.[].amount',
    label: 'Amount allowance',
    format: 'tokenAmount',
    params: {
      tokenPath: 'details.[].token',
      threshold: MAX_160,
      message: 'Unlimited',
    },
  },
  {
    path: 'details.[].expiration',
    label: 'Approval expires',
    format: 'raw',
  },
];

describe('Eip7730FieldList', () => {
  it('shows every element in its own block, each amount with its own token', () => {
    renderList(permitBatch, {
      spender: RECIPIENT,
      details: [
        { token: USDC, amount: 1_000_000n, expiration: 1n },
        { token: WETH, amount: BigInt(MAX_160), expiration: 2n },
      ],
    });
    expect(screen.getByText(`Spender: ${RECIPIENT}`)).toBeTruthy();
    expect(screen.getByText('Item 1 of 2')).toBeTruthy();
    expect(screen.getByText('Item 2 of 2')).toBeTruthy();
    expect(screen.getByText('Amount allowance: 1 USDC')).toBeTruthy();
    expect(screen.getByText('Amount allowance: Unlimited WETH')).toBeTruthy();
    expect(screen.getAllByText(UNLIMITED_APPROVAL_WARNING)).toHaveLength(1);
    expect(screen.getByText('Approval expires: 1')).toBeTruthy();
    expect(screen.getByText('Approval expires: 2')).toBeTruthy();
  });

  it('shows a single element as plain rows', () => {
    renderList(permitBatch, {
      spender: RECIPIENT,
      details: [{ token: USDC, amount: 1_000_000n, expiration: 1n }],
    });
    expect(screen.queryByText(/Item 1/)).toBeNull();
    expect(screen.getByText('Amount allowance: 1 USDC')).toBeTruthy();
  });

  it('shows a dash for each field over an empty array', () => {
    renderList(permitBatch, { spender: RECIPIENT, details: [] });
    expect(screen.getByText('Amount allowance: —')).toBeTruthy();
    expect(screen.getByText('Approval expires: —')).toBeTruthy();
  });

  it('nests blocks for an array inside an array', () => {
    renderList(
      [{ path: 'swaps.[].route.[].pool', label: 'Pool', format: 'raw' }],
      {
        swaps: [
          { route: [{ pool: 'a' }, { pool: 'b' }] },
          { route: [{ pool: 'c' }] },
        ],
      },
    );
    expect(screen.getAllByText('Item 1 of 2')).toHaveLength(2);
    expect(screen.getAllByText('Item 2 of 2')).toHaveLength(2);
    for (const pool of ['a', 'b', 'c']) {
      expect(screen.getByText(`Pool: ${pool}`)).toBeTruthy();
    }
  });

  it('applies a visibility rule to each element', () => {
    renderList(
      [
        {
          path: 'orders.[].expiry',
          label: 'Expires',
          format: 'raw',
          visible: { ifNotIn: ['0'] },
        },
      ],
      { orders: [{ expiry: 0n }, { expiry: 7n }] },
    );
    expect(screen.getByText('Expires: 7')).toBeTruthy();
    expect(screen.queryByText('Expires: 0')).toBeNull();
  });

  it('shows the last element of an array, an address read out of its word', () => {
    const packed = 0x80n * 2n ** 248n + BigInt(RECIPIENT);
    renderList(
      [{ path: 'pools.[-1]', label: 'Last pool', format: 'addressName' }],
      { pools: [1n, packed] },
    );
    expect(screen.getByText(`Last pool: ${RECIPIENT}`)).toBeTruthy();
  });

  it('reads a slice of bytes as one value', () => {
    renderList(
      [
        {
          path: 'creds.[12:32]',
          label: 'Withdrawal address',
          format: 'addressName',
        },
        { path: 'creds.[:1]', label: 'Type', format: 'raw' },
      ],
      { creds: `0x01${'00'.repeat(11)}${RECIPIENT.slice(2).toLowerCase()}` },
    );
    expect(screen.getByText(`Withdrawal address: ${RECIPIENT}`)).toBeTruthy();
    expect(screen.getByText('Type: 0x01')).toBeTruthy();
    expect(screen.queryByText(/Item/)).toBeNull();
  });

  describe('with inner calls', () => {
    const transfer = encodeFunctionData({
      abi: [
        parseAbiItem(
          'function transfer(address to, uint256 amount)',
        ) as AbiFunction,
      ],
      args: [RECIPIENT, 1_500_000n],
    });
    const calls = [
      { to: USDT, value: 0n, data: transfer },
      { to: USDT, value: 5n, data: transfer },
    ];
    const data: Eip7730Field = {
      path: 'calls.[].data',
      label: 'Call',
      format: 'calldata',
      params: { calleePath: 'calls.[].to', amountPath: 'calls.[].value' },
    };

    it('keeps an array of inner calls alone as its list of calls', () => {
      renderList([data], { calls });
      expect(screen.getByText('Call 1 of 2')).toBeTruthy();
      expect(screen.queryByText(/Item/)).toBeNull();
    });

    it('puts each call with the other fields over its array', () => {
      renderList(
        [
          { path: 'calls.[].to', label: 'To', format: 'addressName' },
          { path: 'calls.[].value', label: 'Value', format: 'raw' },
          data,
        ],
        { calls },
      );
      expect(screen.getByText('Item 1 of 2')).toBeTruthy();
      expect(screen.getByText('Value: 0')).toBeTruthy();
      expect(screen.getByText('Value: 5')).toBeTruthy();
      expect(screen.getAllByText('Send')).toHaveLength(2);
      expect(screen.queryByText(/Call 1 of/)).toBeNull();
    });
  });
});
