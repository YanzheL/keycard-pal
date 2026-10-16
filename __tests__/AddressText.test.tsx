import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AddressText, { isDisplayAddress } from '../src/components/AddressText';
import theme from '../src/theme';

describe('AddressText', () => {
  it('recognizes Ethereum and Bitcoin addresses', () => {
    expect(isDisplayAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(
      true,
    );
    expect(isDisplayAddress('bc1qpncfjnresszndse506zmvjya05xcs6493cm8xf')).toBe(
      true,
    );
    expect(isDisplayAddress('0xa9059cbb')).toBe(false);
  });

  it('renders Ethereum addresses in alternating four-character chunks after the prefix', () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const { UNSAFE_getAllByType } = render(<AddressText address={address} />);

    expect(screen.getByText(address)).toBeTruthy();

    const spans = UNSAFE_getAllByType(Text).filter(
      span => typeof span.props.children === 'string',
    );
    expect(spans.map(span => span.props.children)).toEqual([
      '0x',
      'd8dA',
      '6BF2',
      '6964',
      'aF9D',
      '7eEd',
      '9e03',
      'E534',
      '15D3',
      '7aA9',
      '6045',
    ]);
    expect(StyleSheet.flatten(spans[0].props.style).color).toBe(
      theme.colors.onSurfaceMuted,
    );
    expect(StyleSheet.flatten(spans[1].props.style).color).toBe(
      theme.colors.onSurface,
    );
    expect(StyleSheet.flatten(spans[2].props.style).color).toBe(
      theme.colors.onSurfaceSubtle,
    );
    expect(StyleSheet.flatten(spans[1].props.style).fontWeight).toBe('600');
    expect(
      StyleSheet.flatten(spans[1].props.style).backgroundColor,
    ).toBeUndefined();
    expect(StyleSheet.flatten(spans[2].props.style).fontWeight).toBeUndefined();
    expect(
      StyleSheet.flatten(spans[2].props.style).backgroundColor,
    ).toBeUndefined();
  });

  describe('fitting an Ethereum address to one line', () => {
    const address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const layout = (widths: number[]) => ({
      nativeEvent: { lines: widths.map(width => ({ width })) },
    });
    const outer = () => screen.getByText(address);
    const fontSize = () => StyleSheet.flatten(outer().props.style).fontSize;

    it('shrinks an address that wraps by a character', () => {
      render(<AddressText address={address} style={{ fontSize: 14 }} />);
      fireEvent(outer(), 'textLayout', layout([410, 10]));
      expect(fontSize()).toBeCloseTo(14 * (410 / 420) * 0.99);
    });

    it('keeps wrapping when one line would need it much smaller', () => {
      render(<AddressText address={address} style={{ fontSize: 14 }} />);
      fireEvent(outer(), 'textLayout', layout([200, 200, 20]));
      expect(fontSize()).toBe(14);
    });

    it('leaves an address that fits alone', () => {
      render(<AddressText address={address} />);
      fireEvent(outer(), 'textLayout', layout([380]));
      expect(fontSize()).toBeUndefined();
    });

    it('leaves a Bitcoin address wrapping', () => {
      const btc = 'bc1qpncfjnresszndse506zmvjya05xcs6493cm8xf';
      render(<AddressText address={btc} style={{ fontSize: 14 }} />);
      fireEvent(screen.getByText(btc), 'textLayout', layout([300, 20]));
      expect(
        StyleSheet.flatten(screen.getByText(btc).props.style).fontSize,
      ).toBe(14);
    });
  });
});
