import {
  EIP7730_INDEX_VERSION,
  type Eip7730DisplayFormat,
  type Eip7730Index,
  type Eip7730Positions,
} from '../src/utils/eip7730/zip';

/** `chain:address`, then key, to the format: how tests write and read an index. */
type ByDeployment = Record<string, Record<string, Eip7730DisplayFormat>>;

function pack(
  byDeployment: ByDeployment,
  formats: Eip7730DisplayFormat[],
): Eip7730Positions {
  const out: Eip7730Positions = {};
  for (const [deployment, entries] of Object.entries(byDeployment)) {
    const [chainId, address] = deployment.split(':');
    for (const [key, format] of Object.entries(entries)) {
      ((out[address] ??= {})[key] ??= {})[chainId] = formats.push(format) - 1;
    }
  }
  return out;
}

function unpack(
  positions: Eip7730Positions,
  formats: Eip7730DisplayFormat[],
): ByDeployment {
  const out: ByDeployment = {};
  for (const [address, byKey] of Object.entries(positions)) {
    for (const [key, byChain] of Object.entries(byKey)) {
      for (const [chainId, position] of Object.entries(byChain)) {
        (out[`${chainId}:${address}`] ??= {})[key] = formats[position];
      }
    }
  }
  return out;
}

/** An index written the readable way: formats nested under their deployments. */
export function testIndex({
  contracts = {},
  eip712 = {},
  generatedAt = '',
}: {
  contracts?: ByDeployment;
  eip712?: ByDeployment;
  generatedAt?: string;
} = {}): Eip7730Index {
  const formats: Eip7730DisplayFormat[] = [];
  return {
    version: EIP7730_INDEX_VERSION,
    generatedAt,
    formats,
    contracts: pack(contracts, formats),
    eip712: pack(eip712, formats),
  };
}

/** The same index read back with every format under its deployments. */
export function nested(index: Eip7730Index): {
  contracts: ByDeployment;
  eip712: ByDeployment;
} {
  return {
    contracts: unpack(index.contracts, index.formats),
    eip712: unpack(index.eip712, index.formats),
  };
}
