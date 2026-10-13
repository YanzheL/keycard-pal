import { StyleSheet, View } from 'react-native';

import InfoRow from '@/components/InfoRow';

import type { MatchedDescriptor } from '@/hooks/useCalldataDescriptor';

import { lookupToken } from '@/utils/tokenMetadata';
import type { DecodedCall } from '@/utils/txParser';

import ContractCallSection from './ContractCallSection';
import Eip7730CallSection from './Eip7730CallSection';
import Erc20ApproveSection from './Erc20ApproveSection';
import Erc20TransferFromSection from './Erc20TransferFromSection';
import Erc20TransferSection from './Erc20TransferSection';
import TokenContractRows from './TokenContractRows';
import UniversalRouterSection from './UniversalRouterSection';

export function isTokenCall(call: DecodedCall): boolean {
  return (
    call.kind === 'erc20-transfer' ||
    call.kind === 'erc20-transferFrom' ||
    call.kind === 'erc20-approve'
  );
}

export default function DecodedCallSection({
  call,
  tokenContract,
  chainId,
  descriptor,
  depth = 0,
}: {
  call: DecodedCall;
  tokenContract?: string;
  chainId?: number;
  descriptor?: MatchedDescriptor | null;
  depth?: number;
}) {
  if (descriptor) {
    return (
      <>
        {/* The header leaves out To for token calls, so the contract is shown here. */}
        {isTokenCall(call) && (
          <TokenContractRows
            token={lookupToken(chainId, tokenContract)}
            tokenContract={tokenContract}
          />
        )}
        <Eip7730CallSection
          format={descriptor.format}
          resolvePath={descriptor.resolvePath}
          resolveEach={descriptor.resolveEach}
          depth={depth}
          contractAddress={tokenContract}
          chainId={chainId}
          shownContract={isTokenCall(call) ? tokenContract : undefined}
        />
      </>
    );
  }

  if (call.kind === 'erc20-transfer')
    return (
      <Erc20TransferSection
        call={call}
        tokenContract={tokenContract}
        chainId={chainId}
      />
    );

  if (call.kind === 'erc20-transferFrom')
    return (
      <Erc20TransferFromSection
        call={call}
        tokenContract={tokenContract}
        chainId={chainId}
      />
    );

  if (call.kind === 'erc20-approve')
    return (
      <Erc20ApproveSection
        call={call}
        tokenContract={tokenContract}
        chainId={chainId}
      />
    );

  if (call.kind === 'contract-call') return <ContractCallSection call={call} />;

  if (call.kind === 'universal-router-execute')
    return <UniversalRouterSection call={call} />;

  return (
    <View style={styles.row}>
      <InfoRow label="Contract call" value={call.selector} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
  },
});
