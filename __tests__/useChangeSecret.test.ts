import { act, renderHook } from '@testing-library/react-native';

import { useChangeSecret } from '../src/hooks/keycard/useChangeSecret';

type OperationFn = (cmdSet: any, newSecret: string) => Promise<void>;

let capturedOperation: OperationFn | null = null;
let capturedOptions: {
  requiresPin?: boolean;
  requiresMasterKey?: boolean;
  requiresRoute?: string;
  retryOnTagLoss?: boolean;
  successMessage?: string;
} | null = null;

const mockStart = jest.fn();

jest.mock('../src/hooks/keycard/useKeycardOperation', () => ({
  useKeycardOp: (
    fn: OperationFn,
    opts: {
      requiresPin?: boolean;
      requiresMasterKey?: boolean;
      requiresRoute?: string;
      retryOnTagLoss?: boolean;
      successMessage?: string;
    },
  ) => {
    capturedOperation = fn;
    capturedOptions = opts;
    return {
      phase: 'idle',
      status: '',
      cardName: null,
      result: null,
      pinError: null,
      start: mockStart,
      cancel: jest.fn(),
      reset: jest.fn(),
      submitPin: jest.fn(),
      proceedWithNonGenuine: jest.fn(),
    };
  },
}));

describe('useChangeSecret', () => {
  beforeEach(() => {
    mockStart.mockClear();
    capturedOperation = null;
    capturedOptions = null;
  });

  it('does not require master key', () => {
    renderHook(() => useChangeSecret('pin'));

    expect(capturedOptions).toEqual({
      requiresMasterKey: false,
      successMessage: 'PIN changed',
    });
  });

  // Stops a different card being tapped the second time.
  it('binds only the pairing secret to cards that have one', () => {
    renderHook(() => useChangeSecret('pairing'));
    expect(capturedOptions?.requiresRoute).toBe('ChangePairingSecret');

    for (const secretType of ['pin', 'puk'] as const) {
      renderHook(() => useChangeSecret(secretType));
      expect(capturedOptions?.requiresRoute).toBeUndefined();
    }
  });

  // A replayed write could land twice, so none of the three may opt in.
  it.each(['pin', 'puk', 'pairing'] as const)(
    'never retries a %s change on tag loss',
    secretType => {
      renderHook(() => useChangeSecret(secretType));
      expect(capturedOptions?.retryOnTagLoss).toBeUndefined();
    },
  );

  it('hands the new secret to the runner', async () => {
    const { result } = renderHook(() => useChangeSecret('pin'));
    await act(async () => {
      result.current.start('123456');
    });

    expect(mockStart).toHaveBeenCalledWith('123456');
  });

  it.each([
    ['pin', 'changePIN', '123456'],
    ['puk', 'changePUK', '123456789012'],
    ['pairing', 'changePairingPassword', 'newpassword'],
  ] as const)(
    'changes the %s to the secret it is given',
    async (secretType, command, secret) => {
      renderHook(() => useChangeSecret(secretType));
      const checkOK = jest.fn();
      const cmdSet = { [command]: jest.fn().mockResolvedValue({ checkOK }) };

      await capturedOperation!(cmdSet, secret);

      expect(cmdSet[command]).toHaveBeenCalledWith(secret);
      expect(checkOK).toHaveBeenCalledTimes(1);
    },
  );

  it('fails when the card refuses the change', async () => {
    renderHook(() => useChangeSecret('pairing'));
    const cmdSet = {
      changePairingPassword: jest.fn().mockResolvedValue({
        checkOK: () => {
          throw new Error('refused');
        },
      }),
    };

    await expect(capturedOperation!(cmdSet, 'newpassword')).rejects.toThrow(
      'refused',
    );
  });
});
