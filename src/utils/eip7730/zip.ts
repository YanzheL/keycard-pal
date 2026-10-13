// scripts/generate-eip7730.js loads this file under plain Node: no `@/` imports, no React Native.
import { unzipSync, strFromU8 } from 'fflate';
import { toFunctionSelector } from 'viem';

export type Eip7730FieldFormat =
  | 'raw'
  | 'amount'
  | 'tokenAmount'
  | 'date'
  | 'enum'
  | 'addressName'
  | 'calldata';

/** The spec's `visible` object; list entries are kept as text. */
export type Eip7730Visibility = { ifNotIn?: string[]; mustMatch?: string[] };

export type Eip7730Field = {
  path: string;
  label: string;
  format: Eip7730FieldFormat;
  params?: Record<string, unknown>;
  value?: string;
  visible?: Eip7730Visibility;
};

export type Eip7730TokenMetadata = {
  decimals?: number;
  ticker?: string;
};

export type Eip7730DisplayFormat = {
  intent?: string;
  /** Kept only when every placeholder names an always-visible field the app can show inline. */
  interpolatedIntent?: string;
  /** The descriptor's function signature, parameter names included, when it keys the format by one. */
  signature?: string;
  fields: Eip7730Field[];
  /** The spec binds an EIP-712 format to these domain values. */
  domain?: Record<string, string>;
  metadata?: {
    enums?: Record<string, Record<string, string>>;
    tokens?: Record<string, Eip7730TokenMetadata>;
    owner?: string;
  };
};

/** Address, then selector or encodeType, then chain ID, to a position in `formats`. */
export type Eip7730Positions = Record<
  string,
  Record<string, Record<string, number>>
>;

// Formats and keys are stored once: deployments repeat both, often across dozens of chains.
export type Eip7730Index = {
  version: number;
  generatedAt: string;
  formats: Eip7730DisplayFormat[];
  contracts: Eip7730Positions;
  eip712: Eip7730Positions;
};

/** Part of an index: what one saved slice file holds, read on its own. */
export type Eip7730IndexSlice = Pick<
  Eip7730Index,
  'formats' | 'contracts' | 'eip712'
>;

export const EIP7730_INDEX_VERSION = 7;

const SCHEMA_MAJOR = 2;
const SELECTOR_RE = /^0x[0-9a-f]{8}$/i;
const ADDRESS_RE = /^0x[0-9a-f]{40}$/i;
// The registry unpacks to about 4 MB of JSON; a zip claiming far more is refused.
const MAX_JSON_BYTES = 64 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const CONSTANT_REF = '$.metadata.constants.';
const DEFINITION_REF = '$.display.definitions.';

type Json = Record<string, unknown>;
type JsonFiles = Map<string, unknown>;
type FormatsByDeployment = Record<
  string,
  Record<string, Record<string, Eip7730DisplayFormat>>
>;
type FieldSources = { definitions: Json; constants: Json };

function isPlainObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** ERC-20 decimals are a uint8; anything else would break amount formatting. */
export function isDecimals(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 255
  );
}

function own(object: Json, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key)
    ? object[key]
    : undefined;
}

function normaliseSelector(key: string): string | null {
  if (SELECTOR_RE.test(key)) return key.toLowerCase();
  try {
    return toFunctionSelector(key).toLowerCase();
  } catch {
    return null;
  }
}

function substituteConstant(value: unknown, constants: Json): unknown {
  if (Array.isArray(value)) {
    return value.map(v => substituteConstant(v, constants));
  }
  if (typeof value !== 'string' || !value.startsWith(CONSTANT_REF)) {
    return value;
  }
  const constant = own(constants, value.slice(CONSTANT_REF.length));
  return constant === undefined ? value : constant;
}

function withConstants(params: unknown, constants: Json): Json | undefined {
  if (!isPlainObject(params)) return undefined;
  const out: Json = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = substituteConstant(value, constants);
  }
  return out;
}

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function valueList(value: unknown, constants: Json): string[] {
  const list = substituteConstant(value, constants);
  return Array.isArray(list)
    ? [...new Set(list.filter(isScalar).map(String))]
    : [];
}

function visibilityRule(
  raw: unknown,
  constants: Json,
): Eip7730Visibility | undefined {
  if (!isPlainObject(raw)) return undefined;
  const rule: Eip7730Visibility = {};
  const ifNotIn = own(raw, 'ifNotIn');
  if (ifNotIn !== undefined) rule.ifNotIn = valueList(ifNotIn, constants);
  const mustMatch = own(raw, 'mustMatch');
  // An entry the app cannot compare matches nothing, so the check fails closed.
  if (mustMatch !== undefined) rule.mustMatch = valueList(mustMatch, constants);
  return rule.ifNotIn || rule.mustMatch ? rule : undefined;
}

function mergeParams(base: unknown, override: unknown): Json | undefined {
  if (!isPlainObject(base))
    return isPlainObject(override) ? override : undefined;
  return isPlainObject(override) ? { ...base, ...override } : base;
}

function withDefinition(field: Json, definitions: Json): Json {
  const ref = field.$ref;
  if (typeof ref !== 'string' || !ref.startsWith(DEFINITION_REF)) return field;
  const definition = own(definitions, ref.slice(DEFINITION_REF.length));
  if (!isPlainObject(definition)) return field;
  const merged: Json = { ...definition, ...field };
  delete merged.$ref;
  const params = mergeParams(definition.params, field.params);
  if (params) merged.params = params;
  return merged;
}

function joinFieldPath(prefix: string | undefined, path: string): string {
  return prefix && !/^[#@$]\./.test(path) ? `${prefix}.${path}` : path;
}

// Relative param paths inside a group are relative to the group, as field paths are.
function withGroupPaths(
  params: Json | undefined,
  prefix: string | undefined,
): Json | undefined {
  if (!params || !prefix) return params;
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      key.endsWith('Path') && typeof value === 'string'
        ? joinFieldPath(prefix, value)
        : value,
    ]),
  );
}

function expandFields(
  rawFields: unknown,
  sources: FieldSources,
  prefix?: string,
  alwaysVisible: Set<string> = new Set(),
): Eip7730Field[] {
  if (!Array.isArray(rawFields)) return [];
  const out: Eip7730Field[] = [];
  for (const item of rawFields) {
    if (!isPlainObject(item)) continue;
    const field = withDefinition(item, sources.definitions);
    const path =
      typeof field.path === 'string'
        ? joinFieldPath(prefix, field.path)
        : undefined;
    if (Array.isArray(field.fields)) {
      out.push(
        ...expandFields(field.fields, sources, path ?? prefix, alwaysVisible),
      );
      continue;
    }
    if (field.visible === 'never') continue;
    const visible = visibilityRule(field.visible, sources.constants);
    // A hidden field still has to be checked, and it needs no format to be.
    if (typeof field.format !== 'string' && !visible?.mustMatch) continue;
    const format = (
      typeof field.format === 'string' ? field.format : 'raw'
    ) as Eip7730FieldFormat;
    const params = withGroupPaths(
      withConstants(field.params, sources.constants),
      prefix,
    );
    const value = substituteConstant(field.value, sources.constants);
    const rule = visible ? { visible } : {};
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value);
      // An unresolved constant would show its own reference as the value.
      if (text.startsWith('$.')) continue;
      const label = typeof field.label === 'string' ? field.label : '';
      out.push({ path: '', label, format, params, value: text, ...rule });
      continue;
    }
    if (!path) continue;
    const label = typeof field.label === 'string' ? field.label : path;
    out.push({ path, label, format, params, ...rule });
    if (field.visible === undefined || field.visible === 'always') {
      alwaysVisible.add(normalizeFieldPath(path));
    }
  }
  return out;
}

export function normalizeFieldPath(path: string): string {
  return path.startsWith('#.') ? path.slice(2) : path;
}

export type InterpolationPart = { text: string } | { path: string };

/** `{path}` placeholders and `{{`/`}}` escapes; null when the braces do not pair up. */
export function interpolationParts(
  template: string,
): InterpolationPart[] | null {
  const parts: InterpolationPart[] = [];
  let text = '';
  let i = 0;
  while (i < template.length) {
    const c = template[i];
    if ((c === '{' || c === '}') && template[i + 1] === c) {
      text += c;
      i += 2;
      continue;
    }
    if (c === '}') return null;
    if (c === '{') {
      const end = template.indexOf('}', i + 1);
      const path = end === -1 ? '' : template.slice(i + 1, end);
      if (!path.trim() || path.includes('{')) return null;
      if (text) parts.push({ text });
      text = '';
      parts.push({ path: path.trim() });
      i = end + 1;
      continue;
    }
    text += c;
    i += 1;
  }
  if (text) parts.push({ text });
  return parts;
}

function validInterpolation(
  template: string,
  fields: Eip7730Field[],
  alwaysVisible: Set<string>,
): boolean {
  const parts = interpolationParts(template);
  if (!parts) return false;
  return parts.every(part => {
    if ('text' in part) return true;
    const path = normalizeFieldPath(part.path);
    const field = fields.find(f => normalizeFieldPath(f.path) === path);
    // The spec allows only always-visible fields; an inner call cannot be a phrase.
    return (
      field !== undefined &&
      field.format !== 'calldata' &&
      alwaysVisible.has(path)
    );
  });
}

function extractMetadata(
  rawMeta: unknown,
): Eip7730DisplayFormat['metadata'] | undefined {
  if (!isPlainObject(rawMeta)) return undefined;
  const result: Eip7730DisplayFormat['metadata'] = {};
  if (isPlainObject(rawMeta.enums)) {
    const enums: Record<string, Record<string, string>> = {};
    for (const [k, v] of Object.entries(rawMeta.enums)) {
      if (!isPlainObject(v)) continue;
      const mapped: Record<string, string> = {};
      for (const [k2, v2] of Object.entries(v)) {
        if (typeof v2 === 'string') mapped[String(k2)] = v2;
      }
      enums[k] = mapped;
    }
    if (Object.keys(enums).length > 0) result.enums = enums;
  }
  if (isPlainObject(rawMeta.token)) {
    const t = rawMeta.token;
    const decimals = isDecimals(t.decimals) ? t.decimals : undefined;
    const ticker = typeof t.ticker === 'string' ? t.ticker : undefined;
    if (decimals !== undefined || ticker !== undefined) {
      const addr =
        typeof t.address === 'string' ? t.address.toLowerCase() : '*';
      result.tokens = { [addr]: { decimals, ticker } };
    }
  }
  if (
    isPlainObject(rawMeta.info) &&
    typeof rawMeta.info.legalName === 'string'
  ) {
    result.owner = rawMeta.info.legalName;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function extractDisplayFormat(
  rawFormat: unknown,
  metadata: Eip7730DisplayFormat['metadata'] | undefined,
  sources: FieldSources,
): Eip7730DisplayFormat | null {
  if (!isPlainObject(rawFormat)) return null;
  const alwaysVisible = new Set<string>();
  const fields = expandFields(
    rawFormat.fields,
    sources,
    undefined,
    alwaysVisible,
  );
  if (fields.length === 0 && typeof rawFormat.intent !== 'string') return null;
  const out: Eip7730DisplayFormat = { fields };
  if (typeof rawFormat.intent === 'string') out.intent = rawFormat.intent;
  const template = rawFormat.interpolatedIntent;
  if (
    typeof template === 'string' &&
    validInterpolation(template, fields, alwaysVisible)
  ) {
    out.interpolatedIntent = template;
  }
  if (metadata) out.metadata = metadata;
  return out;
}

type Deployment = { chainId: number; address: string };

function extractDeployments(rawDeployments: unknown): Deployment[] {
  if (!Array.isArray(rawDeployments)) return [];
  const out: Deployment[] = [];
  for (const d of rawDeployments) {
    if (!isPlainObject(d)) continue;
    const chainId =
      typeof d.chainId === 'number' ? d.chainId : Number(d.chainId);
    const address = typeof d.address === 'string' ? d.address : '';
    // The address names a saved slice file, so anything else is dropped here.
    if (!Number.isSafeInteger(chainId) || chainId <= 0) continue;
    if (!ADDRESS_RE.test(address)) continue;
    out.push({ chainId, address: address.toLowerCase() });
  }
  return out;
}

function extractDomain(raw: unknown): Record<string, string> | undefined {
  if (!isPlainObject(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function insertEntry(
  bucket: FormatsByDeployment,
  deployment: Deployment,
  key: string,
  value: Eip7730DisplayFormat,
): void {
  const byKey = (bucket[deployment.address] ??= {});
  (byKey[key] ??= {})[deployment.chainId] = value;
}

function processDescriptor(
  raw: unknown,
  contracts: FormatsByDeployment,
  eip712: FormatsByDeployment,
): void {
  if (!isPlainObject(raw)) return;
  const context = isPlainObject(raw.context) ? raw.context : null;
  const display = isPlainObject(raw.display) ? raw.display : null;
  if (!context || !display) return;
  const formats = isPlainObject(display.formats) ? display.formats : null;
  if (!formats) return;

  const metadata = extractMetadata(raw.metadata);
  const sources: FieldSources = {
    definitions: isPlainObject(display.definitions) ? display.definitions : {},
    constants:
      isPlainObject(raw.metadata) && isPlainObject(raw.metadata.constants)
        ? raw.metadata.constants
        : {},
  };

  const contractCtx = isPlainObject(context.contract) ? context.contract : null;
  const eip712Ctx = isPlainObject(context.eip712) ? context.eip712 : null;

  if (contractCtx) {
    const deployments = extractDeployments(contractCtx.deployments);
    if (deployments.length === 0) return;
    for (const [rawKey, rawFormat] of Object.entries(formats)) {
      const selector = normaliseSelector(rawKey);
      if (!selector) continue;
      const format = extractDisplayFormat(rawFormat, metadata, sources);
      if (!format) continue;
      if (!SELECTOR_RE.test(rawKey)) format.signature = rawKey;
      for (const d of deployments) {
        insertEntry(contracts, d, selector, format);
      }
    }
    return;
  }

  if (eip712Ctx) {
    // The app cannot verify a domain separator, so such a binding never applies.
    if (eip712Ctx.domainSeparator !== undefined) return;
    const deployments = extractDeployments(eip712Ctx.deployments);
    if (deployments.length === 0) return;
    const domain = extractDomain(eip712Ctx.domain);
    for (const [encodedType, rawFormat] of Object.entries(formats)) {
      const format = extractDisplayFormat(rawFormat, metadata, sources);
      if (!format) continue;
      if (domain) format.domain = domain;
      for (const d of deployments) {
        insertEntry(eip712, d, encodedType, format);
      }
    }
  }
}

function pointAtFormats(
  byDeployment: FormatsByDeployment,
  formats: Eip7730DisplayFormat[],
  seen: { byObject: Map<object, number>; byContent: Map<string, number> },
): Eip7730Positions {
  const out: Eip7730Positions = {};
  for (const [address, byKey] of Object.entries(byDeployment)) {
    out[address] = {};
    for (const [key, byChain] of Object.entries(byKey)) {
      out[address][key] = {};
      for (const [chainId, format] of Object.entries(byChain)) {
        let position = seen.byObject.get(format);
        if (position === undefined) {
          // Different descriptors repeat the same format, an ERC-20 transfer for one.
          const content = JSON.stringify(format);
          position = seen.byContent.get(content);
          if (position === undefined) {
            position = formats.length;
            formats.push(format);
            seen.byContent.set(content, position);
          }
          seen.byObject.set(format, position);
        }
        out[address][key][chainId] = position;
      }
    }
  }
  return out;
}

export function buildIndexFromDescriptors(
  descriptors: unknown[],
): Eip7730Index {
  const contracts: FormatsByDeployment = {};
  const eip712: FormatsByDeployment = {};
  for (const raw of descriptors) {
    try {
      processDescriptor(raw, contracts, eip712);
    } catch {
      // A descriptor this parser cannot read costs only itself.
    }
  }
  const formats: Eip7730DisplayFormat[] = [];
  const seen = { byObject: new Map<object, number>(), byContent: new Map() };
  return {
    version: EIP7730_INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    formats,
    contracts: pointAtFormats(contracts, formats, seen),
    eip712: pointAtFormats(eip712, formats, seen),
  };
}

export function indexedFormat(
  index: Eip7730IndexSlice,
  bucket: 'contracts' | 'eip712',
  chainId: number,
  address: string,
  key: string,
): Eip7730DisplayFormat | null {
  const position = index[bucket][address]?.[key]?.[chainId];
  return position === undefined ? null : index.formats[position] ?? null;
}

export function isEmptyIndex(index: Eip7730Index): boolean {
  return (
    Object.keys(index.contracts).length === 0 &&
    Object.keys(index.eip712).length === 0
  );
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function resolveRelative(dir: string, ref: string): string {
  const parts = dir ? dir.split('/') : [];
  for (const segment of ref.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

// Fields without a path survive, and params merge one level deep, as the spec's own
// example needs; the registry's resolver drops the first and replaces the second.
function mergeFields(included: unknown[], including: unknown[]): unknown[] {
  const overrides = new Map<unknown, Json>();
  for (const f of including) {
    if (isPlainObject(f) && f.path !== undefined) overrides.set(f.path, f);
  }
  const known = new Set<unknown>();
  const merged = included.map(f => {
    if (!isPlainObject(f)) return f;
    known.add(f.path);
    const override = f.path === undefined ? undefined : overrides.get(f.path);
    if (!override) return f;
    const out: Json = { ...f, ...override };
    const params = mergeParams(f.params, override.params);
    if (params) out.params = params;
    return out;
  });
  const appended = including.filter(
    f => !isPlainObject(f) || f.path === undefined || !known.has(f.path),
  );
  return [...merged, ...appended];
}

// The including file wins, as in the registry's resolve-erc7730-includes.js.
function deepMerge(base: unknown, override: unknown): unknown {
  if (override === undefined || override === null) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const out: Json = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = base[key];
    if (key === 'fields' && Array.isArray(current) && Array.isArray(value)) {
      out.fields = mergeFields(current, value);
    } else if (isPlainObject(current) && isPlainObject(value)) {
      out[key] = deepMerge(current, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function resolveIncludes(
  path: string,
  files: JsonFiles,
  seen: string[] = [],
): Json | null {
  const doc = files.get(path);
  if (!isPlainObject(doc)) return null;
  if (typeof doc.includes !== 'string' || doc.includes === '') return doc;
  if (seen.includes(path)) return null;
  const included = resolveIncludes(
    resolveRelative(dirOf(path), doc.includes),
    files,
    [...seen, path],
  );
  if (!included) return null;
  const including: Json = { ...doc };
  delete including.includes;
  return deepMerge(included, including) as Json;
}

function findSpec(name: string, files: JsonFiles): string | undefined {
  for (const key of files.keys()) {
    if (key === `specs/${name}` || key.endsWith(`/specs/${name}`)) return key;
  }
  return undefined;
}

function schemaMajor(path: string, files: JsonFiles): number | null {
  const doc = files.get(path);
  const ref = isPlainObject(doc) ? doc.$schema : undefined;
  if (typeof ref !== 'string') return null;
  // A URL cannot be fetched offline; the registry ships the same file in its specs folder.
  const target = ref.includes('://')
    ? findSpec(ref.slice(ref.lastIndexOf('/') + 1), files)
    : resolveRelative(dirOf(path), ref);
  const schema = target === undefined ? undefined : files.get(target);
  const version = isPlainObject(schema) ? schema.version : undefined;
  if (typeof version !== 'string') return null;
  const major = Number(version.split('.')[0]);
  return Number.isInteger(major) ? major : null;
}

function isDescriptorPath(path: string): boolean {
  const segments = path.split('/');
  return (
    (segments.includes('registry') || segments.includes('ercs')) &&
    !segments.some(s => s === 'tests' || s === 'testsv2' || s === 'specs')
  );
}

function isReadPath(name: string): boolean {
  const segments = name.split('/');
  return (
    name.toLowerCase().endsWith('.json') &&
    segments.some(s => s === 'registry' || s === 'ercs' || s === 'specs')
  );
}

function readJsonFiles(zipBytes: Uint8Array): JsonFiles {
  const files: JsonFiles = new Map();
  let total = 0;
  const unzipped = unzipSync(zipBytes, {
    filter: file => {
      if (!isReadPath(file.name)) return false;
      total += file.originalSize;
      if (file.originalSize > MAX_FILE_BYTES || total > MAX_JSON_BYTES) {
        throw new Error('The zip unpacks to more than a registry ever holds.');
      }
      return true;
    },
  });
  for (const [name, bytes] of Object.entries(unzipped)) {
    try {
      files.set(name, JSON.parse(strFromU8(bytes)));
    } catch {
      // Not JSON: nothing to index.
    }
  }
  return files;
}

export function processRegistryZip(zipBytes: Uint8Array): Eip7730Index {
  const files = readJsonFiles(zipBytes);
  const descriptors: Json[] = [];
  for (const path of files.keys()) {
    try {
      if (
        !isDescriptorPath(path) ||
        schemaMajor(path, files) !== SCHEMA_MAJOR
      ) {
        continue;
      }
      const resolved = resolveIncludes(path, files);
      if (resolved) descriptors.push(resolved);
    } catch {
      // Includes nested past what the stack holds, for one: skip that descriptor.
    }
  }
  return buildIndexFromDescriptors(descriptors);
}

/** A saved index is split by the address's first byte, so a review reads one small file. */
export function sliceName(address: string): string {
  return address.toLowerCase().slice(2, 4);
}

export function sliceIndex(
  index: Eip7730Index,
): Map<string, Eip7730IndexSlice> {
  const slices = new Map<string, Eip7730IndexSlice>();
  const local = new Map<string, Map<number, number>>();
  for (const bucket of ['contracts', 'eip712'] as const) {
    for (const [address, byKey] of Object.entries(index[bucket])) {
      const name = sliceName(address);
      let slice = slices.get(name);
      let positions = local.get(name);
      if (!slice || !positions) {
        slice = { formats: [], contracts: {}, eip712: {} };
        positions = new Map();
        slices.set(name, slice);
        local.set(name, positions);
      }
      const keys: Record<string, Record<string, number>> = {};
      for (const [key, byChain] of Object.entries(byKey)) {
        keys[key] = {};
        for (const [chainId, position] of Object.entries(byChain)) {
          let at = positions.get(position);
          if (at === undefined) {
            at = slice.formats.push(index.formats[position]) - 1;
            positions.set(position, at);
          }
          keys[key][chainId] = at;
        }
      }
      slice[bucket][address] = keys;
    }
  }
  return slices;
}
