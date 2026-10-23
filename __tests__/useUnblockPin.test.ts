import { act, renderHook } from '@testing-library/react-native';
import { WrongPINException } from 'keycard-sdk/dist/apdu-exception';

import {
  PIN_NOT_BLOCKED_STATUS,
  PUK_BLOCKED_STATUS,
  useUnblockPin,
} from '../src/hooks/keycard/useUnblockPin';

type UnblockInput = { puk: string; newPin: string };
type OperationFn = (
  cmdSet: any,
  input: UnblockInput,
  helpers: { setStatus: () => void; discardInput: () => void },
) => Promise<void>;

let capturedOperation: OperationFn | null = null;
let capturedOptions: Record<string, unknown> | null = null;
let mockPhase = 'idle';

const mockStart = jest.fn();
const mockDiscardInput = jest.fn();

jest.mock('../src/hooks/keycard/useKeycardOperation', () => ({
  useKeycardOp: (fn: OperationFn, opts: Record<string, unknown>) => {
    capturedOperation = fn;
    capturedOptions = opts;
    return {
      phase: mockPhase,
      status: '',
      cardName: null,
      result: null,
      pinError: null,
      pinBlocked: false,
      start: mockStart,
      cancel: jest.fn(),
      reset: jest.fn(),
      submitPin: jest.fn(),
      proceedWithNonGenuine: jest.fn(),
    };
  },
}));

/** The card's answer, with the SDK's reading of it: 0x63CX is a refused secret with X attempts left. */
function response(sw: number) {
  return {
    sw,
    checkAuthOK: () => {
      if (sw >= 0x63c0 && sw <= 0x63cf) {
        throw new WrongPINException(sw - 0x63c0);
      }
      if (sw !== 0x9000) {
        throw new Error(`Unexpected SW 0x${sw.toString(16)}`);
      }
    },
  };
}

const PUK = '123456789012';
const NEW_PIN = '654321';

/** Runs the captured operation and hands back what it threw, if anything. */
async function runOperation(
  cmdSet: any,
  input: UnblockInput = { puk: PUK, newPin: NEW_PIN },
): Promise<Error | null> {
  let thrown: Error | null = null;
  await act(async () => {
    try {
      await capturedOperation!(cmdSet, input, {
        setStatus: jest.fn(),
        discardInput: mockDiscardInput,
      });
    } catch (e) {
      thrown = e as Error;
    }
  });
  return thrown;
}

describe('useUnblockPin', () => {
  beforeEach(() => {
    mockStart.mockClear();
    mockDiscardInput.mockClear();
    capturedOperation = null;
    capturedOptions = null;
    mockPhase = 'idle';
  });

  it('taps without a PIN or a key, and closes with the toast', () => {
    renderHook(() => useUnblockPin());
    expect(capturedOptions).toEqual({
      requiresPin: false,
      requiresMasterKey: false,
      successMessage: 'PIN unblocked',
    });
  });

  // UNBLOCK PIN spends a PUK attempt before the response is read (ADR-0007).
  it('never retries on tag loss', () => {
    renderHook(() => useUnblockPin());
    expect(capturedOptions?.retryOnTagLoss).toBeUndefined();
  });

  it('hands the PUK and the new PIN to the runner', async () => {
    const { result } = renderHook(() => useUnblockPin());
    await act(async () => {
      result.current.start(PUK, NEW_PIN);
    });
    expect(mockStart).toHaveBeenCalledWith({ puk: PUK, newPin: NEW_PIN });
  });

  it('sends the PUK followed by the new PIN', async () => {
    const { result } = renderHook(() => useUnblockPin());
    const cmdSet = {
      unblockPIN: jest.fn().mockResolvedValue(response(0x9000)),
    };
    expect(await runOperation(cmdSet)).toBeNull();
    expect(cmdSet.unblockPIN).toHaveBeenCalledWith(PUK, NEW_PIN);
    expect(result.current.pukError).toBeNull();
  });

  describe('a refused PUK with attempts left', () => {
    it('is asked for again on the screen, not retried from an error', async () => {
      const { result, rerender } = renderHook(() => useUnblockPin());
      await act(async () => {
        result.current.start(PUK, NEW_PIN);
      });
      const cmdSet = {
        unblockPIN: jest.fn().mockResolvedValue(response(0x63c4)),
      };
      const thrown = await runOperation(cmdSet);
      expect(thrown?.message).toBe('PUK is not valid. 4 attempts left.');
      expect(result.current.pukError).toBe(
        'PUK is not valid. 4 attempts left.',
      );
      expect(mockDiscardInput).toHaveBeenCalledTimes(1);

      // The session ends in error; the hook shows the pad instead.
      mockPhase = 'error';
      rerender(undefined);
      expect(result.current.phase).toBe('idle');
    });

    it('counts a single attempt in the singular', async () => {
      const { result } = renderHook(() => useUnblockPin());
      await act(async () => {
        result.current.start(PUK, NEW_PIN);
      });
      await runOperation({
        unblockPIN: jest.fn().mockResolvedValue(response(0x63c1)),
      });
      expect(result.current.pukError).toBe('PUK is not valid. 1 attempt left.');
    });

    it('clears on the next PUK and keeps the new PIN', async () => {
      const { result } = renderHook(() => useUnblockPin());
      await act(async () => {
        result.current.start(PUK, NEW_PIN);
      });
      await runOperation({
        unblockPIN: jest.fn().mockResolvedValue(response(0x63c4)),
      });

      await act(async () => {
        result.current.start('999999999999', NEW_PIN);
      });
      expect(result.current.pukError).toBeNull();
      expect(mockStart).toHaveBeenLastCalledWith({
        puk: '999999999999',
        newPin: NEW_PIN,
      });
    });
  });

  // Nothing to ask again for: the card is past recovery.
  it('reports a blocked PUK as a plain error', async () => {
    const { result, rerender } = renderHook(() => useUnblockPin());
    await act(async () => {
      result.current.start(PUK, NEW_PIN);
    });
    const thrown = await runOperation({
      unblockPIN: jest.fn().mockResolvedValue(response(0x63c0)),
    });
    expect(thrown?.message).toBe(PUK_BLOCKED_STATUS);
    expect(result.current.pukError).toBeNull();
    expect(mockDiscardInput).not.toHaveBeenCalled();
    mockPhase = 'error';
    rerender(undefined);
    expect(result.current.phase).toBe('error');
  });

  // The applet refuses UNBLOCK PIN while the PIN still has attempts.
  it('explains a card whose PIN is not blocked', async () => {
    const { result } = renderHook(() => useUnblockPin());
    await act(async () => {
      result.current.start(PUK, NEW_PIN);
    });
    const thrown = await runOperation({
      unblockPIN: jest.fn().mockResolvedValue(response(0x6985)),
    });
    expect(thrown?.message).toBe(PIN_NOT_BLOCKED_STATUS);
    expect(result.current.pukError).toBeNull();
  });

  it('passes any other refusal through', async () => {
    const { result } = renderHook(() => useUnblockPin());
    await act(async () => {
      result.current.start(PUK, NEW_PIN);
    });
    const thrown = await runOperation({
      unblockPIN: jest.fn().mockResolvedValue(response(0x6a80)),
    });
    expect(thrown?.message).toBe('Unexpected SW 0x6a80');
    expect(result.current.pukError).toBeNull();
  });
});
