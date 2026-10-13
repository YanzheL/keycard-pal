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
