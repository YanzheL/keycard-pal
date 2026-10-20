import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import PukReview, {
  PUK_EXPLAINER,
  PUK_HIDDEN_LABEL,
  PUK_UNCERTAIN_EXPLAINER,
  formatPUK,
} from '../src/components/PukReview';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-paper', () => {
  const { Text } = require('react-native');
  return { MD3DarkTheme: { colors: {} }, Text };
});

jest.mock('@react-native-community/blur', () => ({
  BlurView: 'BlurView',
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PUK = '123456789012';
const onDone = jest.fn();

function renderReview() {
  return render(<PukReview puk={PUK} onDone={onDone} />);
}

async function reveal() {
  await act(async () => {
    fireEvent.press(screen.getByText('Reveal PUK'));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatPUK', () => {
  it('groups the digits in fours', () => {
    expect(formatPUK(PUK)).toBe('1234 5678 9012');
  });
});

describe('PukReview', () => {
  beforeEach(() => {
    onDone.mockClear();
  });

  it('says the card is set up and what the PUK is for', () => {
    renderReview();
    expect(screen.getByText(PUK_EXPLAINER)).toBeTruthy();
    expect(PUK_EXPLAINER).toMatch(/set up/);
  });

  // After a tap lost past INIT the card's state is unknown (#430).
  it('says the card may or may not be set up when uncertain', () => {
    render(<PukReview puk={PUK} onDone={onDone} uncertain />);
    expect(screen.getByText(PUK_UNCERTAIN_EXPLAINER)).toBeTruthy();
    expect(screen.queryByText(PUK_EXPLAINER)).toBeNull();
    expect(PUK_UNCERTAIN_EXPLAINER).toMatch(/may or may not have been set up/);
    expect(PUK_UNCERTAIN_EXPLAINER).toMatch(/initialize it again/);
    expect(
      screen.getByText('1234 5678 9012', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('shows the digits in fours, blurred until revealed', async () => {
    renderReview();
    expect(screen.UNSAFE_queryAllByType('BlurView' as any)).toHaveLength(1);
    await reveal();
    expect(screen.getByText('1234 5678 9012')).toBeTruthy();
    expect(screen.UNSAFE_queryAllByType('BlurView' as any)).toHaveLength(0);
  });

  it('keeps the digits from a screen reader until revealed', async () => {
    renderReview();
    expect(screen.queryByText('1234 5678 9012')).toBeNull();
    expect(screen.getByLabelText(PUK_HIDDEN_LABEL)).toBeTruthy();
    await reveal();
    expect(screen.getByText('1234 5678 9012')).toBeTruthy();
    expect(screen.queryByLabelText(PUK_HIDDEN_LABEL)).toBeNull();
  });

  it('revealing is not acknowledging', async () => {
    renderReview();
    await reveal();
    expect(onDone).not.toHaveBeenCalled();
  });

  // No wait: writing it down is the user's business.
  it('acknowledges as soon as it is revealed', async () => {
    renderReview();
    await reveal();
    fireEvent.press(screen.getByText("I've written it down"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
