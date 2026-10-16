import type { ReactNode } from 'react';

import InfoRow from '../InfoRow';

export default function AddressInfoRow({
  label,
  value,
  name,
}: {
  label: string;
  value: string;
  ens?: boolean;
  name?: ReactNode;
}) {
  return <InfoRow label={label} value={value} name={name} />;
}

import type { SatisfiesOnline } from '@/utils/onlineParity';

// tsc drift guard: this stub must stay interface-compatible with its online twin.
export type _OnlineParity = SatisfiesOnline<
  typeof import('./AddressInfoRow.online'),
  typeof import('./AddressInfoRow.offline')
>;
