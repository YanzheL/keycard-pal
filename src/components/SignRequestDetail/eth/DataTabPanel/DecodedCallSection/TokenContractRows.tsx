import { StyleSheet, View } from 'react-native';

import AddressInfoRow from '@/components/ens/AddressInfoRow.online';

import { checksumEthAddress } from '@/utils/ethereumAddress';
import type { TokenMetadata } from '@/utils/tokenMetadata';

import TokenSymbolRow from './TokenSymbolRow';

export default function TokenContractRows({
  token,
  tokenContract,
}: {
  token: TokenMetadata | null;
  tokenContract?: string;
}) {
  return (
    <>
      {token && <TokenSymbolRow token={token} />}
      {tokenContract && (
        <View style={styles.row}>
          <AddressInfoRow
            label="Token contract"
            value={checksumEthAddress(tokenContract)}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 8,
  },
});
