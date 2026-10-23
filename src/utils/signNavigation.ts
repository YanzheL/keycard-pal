import type { WCContext } from '@/constants/walletConnect';
import type { KeycardParams } from '@/navigation/types';
import type { ScanResult } from '@/types';
import { classifyEthPayload } from '@/utils/ethPayload';

export function buildSignKeycardParams(
  result: ScanResult,
  wcContext?: WCContext,
): KeycardParams | null {
  if (result.kind === 'eth-sign-request') {
    const { signData, derivationPath, chainId, requestId, dataType } =
      result.request;
    // The review shows why instead and withholds Sign.
    if (classifyEthPayload(signData, dataType, chainId).kind === 'invalid') {
      return null;
    }
    return {
      operation: 'sign',
      signMode: 'eth',
      signData,
      derivationPath,
      chainId,
      requestId,
      dataType,
      ...(wcContext ? { wcContext } : {}),
    };
  }
  if (result.kind === 'crypto-psbt') {
    return {
      operation: 'sign',
      signMode: 'btc',
      psbtHex: result.request.psbtHex,
    };
  }
  if (result.kind === 'btc-sign-request') {
    const { requestId, signDataHex, derivationPath, address, origin } =
      result.request;
    return {
      operation: 'sign',
      signMode: 'btc-message',
      requestId,
      signDataHex,
      derivationPath,
      address,
      origin,
    };
  }
  return null;
}
