import {
  arrayIndices,
  bindField,
  firstArraySelector,
  type ArraySelector,
} from '@/utils/eip7730/arrays';
import type { Eip7730FieldContext } from '@/utils/eip7730/format';
import { isFieldShown } from '@/utils/eip7730/visibility';
import type { Eip7730DisplayFormat, Eip7730Field } from '@/utils/eip7730/zip';

import Eip7730FieldRow from './Eip7730FieldRow';
import { ElementBlock } from './shared';

type Item =
  | { field: Eip7730Field }
  | { selector: ArraySelector; fields: Eip7730Field[] };

function itemsOf(fields: Eip7730Field[]): Item[] {
  const items: Item[] = [];
  const arrays = new Map<
    string,
    { selector: ArraySelector; fields: Eip7730Field[] }
  >();
  for (const field of fields) {
    const selector =
      field.value === undefined ? firstArraySelector(field.path) : null;
    if (!selector) {
      items.push({ field });
      continue;
    }
    const known = arrays.get(selector.prefix);
    if (known) {
      known.fields.push(field);
      continue;
    }
    const item = { selector, fields: [field] };
    arrays.set(selector.prefix, item);
    items.push(item);
  }
  // An array of inner calls alone already lists its calls.
  return items.flatMap(item =>
    'selector' in item && item.fields.every(f => f.format === 'calldata')
      ? item.fields.map(field => ({ field }))
      : [item],
  );
}

function Rows({
  fields,
  format,
  ctx,
}: {
  fields: Eip7730Field[];
  format: Eip7730DisplayFormat;
  ctx: Eip7730FieldContext;
}) {
  return (
    <>
      {fields
        .filter(field => isFieldShown(field, ctx))
        .map((field, index) => (
          <Eip7730FieldRow
            key={`${field.path}-${index}`}
            field={field}
            format={format}
            ctx={ctx}
          />
        ))}
    </>
  );
}

export default function Eip7730FieldList({
  fields,
  format,
  ctx,
}: {
  fields: Eip7730Field[];
  format: Eip7730DisplayFormat;
  ctx: Eip7730FieldContext;
}) {
  return (
    <>
      {itemsOf(fields).map((item, i) => {
        if ('field' in item) {
          return (
            <Rows
              key={`${item.field.path}-${i}`}
              fields={[item.field]}
              format={format}
              ctx={ctx}
            />
          );
        }
        const { selector } = item;
        const indices = arrayIndices(selector, ctx);
        // A slice of bytes is one value; an empty array shows its rows empty.
        if (!indices || indices.length === 0) {
          return (
            <Rows
              key={`${selector.prefix}-${i}`}
              fields={item.fields}
              format={format}
              ctx={ctx}
            />
          );
        }
        if (indices.length === 1) {
          return (
            <Eip7730FieldList
              key={`${selector.prefix}-${i}`}
              fields={item.fields.map(field =>
                bindField(field, selector, indices[0]),
              )}
              format={format}
              ctx={ctx}
            />
          );
        }
        return indices.map((index, n) => (
          <ElementBlock
            key={`${selector.prefix}-${index}`}
            title={`Item ${n + 1} of ${indices.length}`}
          >
            <Eip7730FieldList
              fields={item.fields.map(field =>
                bindField(field, selector, index),
              )}
              format={format}
              ctx={ctx}
            />
          </ElementBlock>
        ));
      })}
    </>
  );
}
