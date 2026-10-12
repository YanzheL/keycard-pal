import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { encodeFunctionData, parseAbiItem, type AbiFunction } from 'viem';

import Eip7730InnerCalls from '../src/components/SignRequestDetail/eth/DataTabPanel/Eip7730InnerCalls';
import { UNLIMITED_APPROVAL_WARNING } from '../src/constants/approval';
import {
  buildArgsEachResolver,
  buildArgsPathResolver,
} from '../src/utils/eip7730/paths';
import type { Eip7730FieldContext } from '../src/utils/eip7730/format';
import type { Eip7730Field } from '../src/utils/eip7730/zip';

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

const USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const OTHER_TOKEN = '0x00000000000000000000000000000000000Beef0';
const SOME_CONTRACT = '0x000000000000000000000000000000000000c0DE';
const AAVE_WETH_GATEWAY = '0xD01607c3C5eCABa394D8be377a08590149325722';
const AAVE_V2_POOL = '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9';
const RECIPIENT = '0xD3CDa913deb6F4967B2eF3Aa68F5a843da74c4Ef';

function encode(signature: string, args: unknown[]): string {
  return encodeFunctionData({
    abi: [parseAbiItem(`function ${signature}`) as AbiFunction],
    args,
  });
}

const transfer = encode('transfer(address to, uint256 amount)', [
  RECIPIENT,
  1_500_000n,
]);
const unlimitedApprove = encode('approve(address spender, uint256 amount)', [
  RECIPIENT,
  2n ** 256n - 1n,
]);
const unknownCall =
  '0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001';

const callsField: Eip7730Field = {
  path: 'calls.[].data',
  label: 'Calls',
  format: 'calldata',
  params: { calleePath: 'calls.[].to', amountPath: 'calls.[].value' },
};

function ctxFor(
  args: Record<string, unknown>,
  extra: Partial<Eip7730FieldContext> = {},
): Eip7730FieldContext {
  const container = { to: SOME_CONTRACT, chainId: 1 };
  return {
    chainId: 1,
    resolvePath: buildArgsPathResolver(args, container),
    resolveEach: buildArgsEachResolver(args, container),
    depth: 0,
    ...extra,
  };
}

describe('Eip7730InnerCalls', () => {
  it('shows every call, each with its entry, the app decoding or the raw call', () => {
    const ctx = ctxFor({
      calls: [
        { to: USDT, data: transfer, value: 0n },
        { to: OTHER_TOKEN, data: unlimitedApprove, value: 0n },
        { to: SOME_CONTRACT, data: unknownCall, value: 0n },
      ],
    });
    render(<Eip7730InnerCalls field={callsField} ctx={ctx} />);

    expect(screen.getByText('Calls')).toBeTruthy();
    expect(screen.getByText('Call 1 of 3')).toBeTruthy();
    expect(screen.getByText('Call 3 of 3')).toBeTruthy();

    // The registry's entry for USDT.
    expect(screen.getByText('Send')).toBeTruthy();
    expect(screen.getByText('Amount: 1.5 USDT')).toBeTruthy();

    // No entry for this token: the app's own approve section, warning included.
    expect(screen.getByText(UNLIMITED_APPROVAL_WARNING)).toBeTruthy();
    expect(screen.getByText(`Token contract: ${OTHER_TOKEN}`)).toBeTruthy();

    // Nothing knows this one.
    expect(screen.getByText(`Contract: ${SOME_CONTRACT}`)).toBeTruthy();
    expect(screen.getByText('Contract call: 0xdeadbeef')).toBeTruthy();
    expect(screen.getByText(`Data: ${unknownCall}`)).toBeTruthy();
  });

  it('gives one callee to every call', () => {
    const ctx = ctxFor({ data: [transfer, transfer] }, {});
    const field: Eip7730Field = {
      path: 'data.[]',
      label: 'Calls',
      format: 'calldata',
      params: { callee: USDT },
    };
    render(<Eip7730InnerCalls field={field} ctx={ctx} />);
    expect(screen.getAllByText('Send')).toHaveLength(2);
  });

  it("passes the call's amount to the inner entry as its @.value", () => {
    const deposit = encode(
      'depositETH(address lendingPool, address onBehalfOf, uint16 referralCode)',
      [AAVE_V2_POOL, RECIPIENT, 0],
    );
    const ctx = ctxFor({
      calls: [{ to: AAVE_WETH_GATEWAY, data: deposit, value: 5n * 10n ** 17n }],
    });
    render(<Eip7730InnerCalls field={callsField} ctx={ctx} />);
    expect(screen.getByText('Amount to supply: 0.5 ETH')).toBeTruthy();
    expect(screen.queryByText(/Call 1 of/)).toBeNull();
  });

  it('shows only the callee and the raw call past three levels', () => {
    const ctx = ctxFor(
      { calls: [{ to: USDT, data: transfer, value: 0n }] },
      { depth: 3 },
    );
    render(<Eip7730InnerCalls field={callsField} ctx={ctx} />);
    expect(screen.queryByText('Send')).toBeNull();
    expect(screen.getByText(`Contract: ${USDT}`)).toBeTruthy();
    expect(screen.getByText(`Data: ${transfer}`)).toBeTruthy();
  });

  it('shows a dash for a field that holds no calls', () => {
    render(
      <Eip7730InnerCalls field={callsField} ctx={ctxFor({ calls: [] })} />,
    );
    expect(screen.getByText('Calls: —')).toBeTruthy();
  });

  it('reads a fixed call and works with only a single-value resolver', async () => {
    const field: Eip7730Field = {
      path: '',
      label: 'Action',
      format: 'calldata',
      params: { callee: USDT },
      value: transfer,
    };
    render(
      <Eip7730InnerCalls
        field={field}
        ctx={{ chainId: 1, resolvePath: () => null }}
      />,
    );
    await act(async () => {});
    expect(screen.getByText('Send')).toBeTruthy();
  });
});
