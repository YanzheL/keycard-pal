import type { Eip7730FieldContext } from './format';
import { sliceRange } from './paths';
import { normalizeFieldPath, type Eip7730Field } from './zip';

export type ArraySelector = {
  prefix: string;
  base: string;
  slice?: [string | undefined, string | undefined];
};

export function firstArraySelector(path: string): ArraySelector | null {
  const p = normalizeFieldPath(path);
  const m = /\[(\*?|(-?\d+)?:(-?\d+)?)\]/.exec(p);
  if (!m) return null;
  return {
    prefix: p.slice(0, m.index + m[0].length),
    base: p.slice(0, m.index),
    ...(m[1].includes(':') && { slice: [m[2], m[3]] }),
  };
}

/** Null when the selector takes no array, as a slice of bytes does. */
export function arrayIndices(
  selector: ArraySelector,
  ctx: Pick<Eip7730FieldContext, 'resolveEach'>,
): number[] | null {
  if (!ctx.resolveEach) return null;
  const length = ctx.resolveEach(`${selector.base}[]`).length;
  if (!selector.slice) return Array.from({ length }, (_, i) => i);
  if (length === 0) return null;
  const [start, end] = sliceRange(length, ...selector.slice);
  return Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
}

function bindPath(path: string, selector: ArraySelector, index: number) {
  const p = normalizeFieldPath(path);
  return p.startsWith(selector.prefix)
    ? `${selector.base}[${index}]${p.slice(selector.prefix.length)}`
    : path;
}

// Every array a param reads pairs with the element by position in its own selection.
function bindParam(
  path: string,
  selector: ArraySelector,
  own: number,
  at: (s: ArraySelector) => number | undefined,
) {
  const bound = bindPath(path, selector, own);
  if (bound !== path) return bound;
  const other = firstArraySelector(path);
  const index = other ? at(other) : undefined;
  return other && index !== undefined ? bindPath(path, other, index) : path;
}

/** `n` is the element's position in the field's own selection, not its index. */
export function bindField(
  field: Eip7730Field,
  selector: ArraySelector,
  n: number,
  ctx: Pick<Eip7730FieldContext, 'resolveEach'> = {},
): Eip7730Field {
  // Without a resolver only a whole array can be paired; a slice stays unbound.
  const at = (s: ArraySelector) =>
    arrayIndices(s, ctx)?.[n] ?? (s.slice ? undefined : n);
  const own = at(selector) ?? n;
  const params = field.params
    ? Object.fromEntries(
        Object.entries(field.params).map(([key, value]) => [
          key,
          key.endsWith('Path') && typeof value === 'string'
            ? bindParam(value, selector, own, at)
            : value,
        ]),
      )
    : undefined;
  return {
    ...field,
    path: bindPath(field.path, selector, own),
    ...(params && { params }),
  };
}
