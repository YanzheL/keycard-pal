import { arrayIndices, firstArraySelector } from './arrays';
import type { Eip7730FieldContext } from './format';
import type { Eip7730DisplayFormat, Eip7730Field } from './zip';

type ValueSource = Pick<Eip7730FieldContext, 'resolvePath' | 'resolveEach'>;

const INTEGER_RE = /^(-?\d+|0x[0-9a-f]+)$/i;
const HEX_RE = /^0x[0-9a-f]*$/i;

// Other text can be case-sensitive, so only hex ignores case.
export function sameValue(value: string, listed: string): boolean {
  if (value === listed) return true;
  if (INTEGER_RE.test(value) && INTEGER_RE.test(listed)) {
    return BigInt(value) === BigInt(listed);
  }
  return (
    HEX_RE.test(value) &&
    HEX_RE.test(listed) &&
    value.toLowerCase() === listed.toLowerCase()
  );
}

function valuesOf(field: Eip7730Field, source: ValueSource): string[] {
  if (field.value !== undefined) return [field.value];
  if (source.resolveEach) return source.resolveEach(field.path);
  const value = source.resolvePath(field.path);
  return value === null ? [] : [value];
}

export function isFieldShown(
  field: Eip7730Field,
  source: ValueSource,
): boolean {
  const rule = field.visible;
  if (!rule) return true;
  if (rule.mustMatch) return false;
  if (!rule.ifNotIn) return true;
  const value = field.value ?? source.resolvePath(field.path);
  return value === null || !rule.ifNotIn.some(v => sameValue(value, v));
}

export function shownFields(
  format: Eip7730DisplayFormat,
  source: ValueSource,
): Eip7730Field[] {
  return format.fields.filter(field => isFieldShown(field, source));
}

/** A value missing from its `mustMatch` list means the entry does not describe this request. */
export function passesMustMatch(
  format: Eip7730DisplayFormat,
  source: ValueSource,
): boolean {
  return format.fields.every(field => {
    const allowed = field.visible?.mustMatch;
    if (!allowed) return true;
    const values = valuesOf(field, source);
    return (
      values.length > 0 &&
      values.every(value => allowed.some(v => sameValue(value, v)))
    );
  });
}

function countOf(path: string, source: ValueSource): number | null {
  const selector = firstArraySelector(path);
  return selector ? arrayIndices(selector, source)?.length ?? null : null;
}

function arraysLineUp(
  format: Eip7730DisplayFormat,
  source: ValueSource,
): boolean {
  const bundled = new Map<number, number>();
  for (const field of format.fields) {
    if (field.value !== undefined) continue;
    const count = countOf(field.path, source);
    if (count === null) continue;
    const group = field.group;
    if (group?.iteration === 'bundled') {
      const seen = bundled.get(group.id);
      if (seen !== undefined && seen !== count) return false;
      bundled.set(group.id, count);
    }
    const own = firstArraySelector(field.path)?.prefix;
    for (const [key, value] of Object.entries(field.params ?? {})) {
      if (!key.endsWith('Path') || typeof value !== 'string') continue;
      const other = firstArraySelector(value);
      if (!other || other.prefix === own) continue;
      const paired = countOf(value, source);
      if (paired !== null && paired !== count) return false;
    }
  }
  return true;
}

/** False when the entry does not describe this request: a failed `mustMatch` or arrays that do not line up. */
export function fitsRequest(
  format: Eip7730DisplayFormat,
  source: ValueSource,
): boolean {
  return passesMustMatch(format, source) && arraysLineUp(format, source);
}
