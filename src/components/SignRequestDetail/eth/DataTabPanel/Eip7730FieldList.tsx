import { Fragment } from 'react';

import {
  arrayIndices,
  bindField,
  firstArraySelector,
  type ArraySelector,
} from '@/utils/eip7730/arrays';
import type { Eip7730FieldContext } from '@/utils/eip7730/format';
import { isFieldShown } from '@/utils/eip7730/visibility';
import {
  interpolationParts,
  type Eip7730DisplayFormat,
  type Eip7730Field,
} from '@/utils/eip7730/zip';

import Eip7730FieldRow from './Eip7730FieldRow';
import { ElementBlock, SectionHeader } from './shared';

type Entry = { field: Eip7730Field; selector: ArraySelector };
type Item = { field: Eip7730Field } | { key: string; entries: Entry[] };

function arrayKey(entry: Entry, position: number): string {
  const iteration = entry.field.group?.iteration;
  if (iteration === 'bundled') return `group-${entry.field.group?.id}`;
  if (iteration === 'sequential') return `field-${position}`;
  return entry.selector.prefix;
}

function itemsOf(fields: Eip7730Field[]): Item[] {
  const items: Item[] = [];
  const arrays = new Map<string, { key: string; entries: Entry[] }>();
  fields.forEach((field, position) => {
    const selector =
      field.value === undefined ? firstArraySelector(field.path) : null;
    if (!selector) {
      items.push({ field });
      return;
    }
    const entry = { field, selector };
    const key = arrayKey(entry, position);
    const known = arrays.get(key);
    if (known) {
      known.entries.push(entry);
      return;
    }
    const item = { key, entries: [entry] };
    arrays.set(key, item);
    items.push(item);
  });
  // An array of inner calls alone already lists its calls.
  return items.flatMap(item =>
    'entries' in item &&
    item.entries.every(e => e.field.format === 'calldata') &&
    !item.entries.some(e => e.field.separator)
      ? item.entries.map(({ field }) => ({ field }))
      : [item],
  );
}

function separatorTitle(entries: Entry[], index: number): string | null {
  const template = entries.find(e => e.field.separator)?.field.separator;
  const parts = template ? interpolationParts(template) : null;
  if (!parts) return null;
  let title = '';
  for (const part of parts) {
    if ('text' in part) title += part.text;
    else if (part.path === 'index') title += String(index);
    else return null;
  }
  return title;
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

function ArrayItem({
  entries,
  format,
  ctx,
}: {
  entries: Entry[];
  format: Eip7730DisplayFormat;
  ctx: Eip7730FieldContext;
}) {
  const fields = entries.map(e => e.field);
  const indices = arrayIndices(entries[0].selector, ctx);
  // A slice of bytes is one value; an empty array shows its rows empty.
  if (!indices || indices.length === 0) {
    return <Rows fields={fields} format={format} ctx={ctx} />;
  }
  const bound = (n: number) =>
    entries.map(({ field, selector }) => bindField(field, selector, n, ctx));
  const titled = entries.some(e => e.field.separator);
  if (indices.length === 1 && !titled) {
    return (
      <Eip7730FieldList
        fields={bound(0)}
        format={format}
        ctx={ctx}
        groupLabels={false}
      />
    );
  }
  return (
    <>
      {indices.map((index, n) => (
        <ElementBlock
          key={`${entries[0].selector.prefix}-${index}`}
          title={
            separatorTitle(entries, index) ??
            `Item ${n + 1} of ${indices.length}`
          }
        >
          <Eip7730FieldList
            fields={bound(n)}
            format={format}
            ctx={ctx}
            groupLabels={false}
          />
        </ElementBlock>
      ))}
    </>
  );
}

export default function Eip7730FieldList({
  fields,
  format,
  ctx,
  groupLabels = true,
}: {
  fields: Eip7730Field[];
  format: Eip7730DisplayFormat;
  ctx: Eip7730FieldContext;
  /** False inside an element block, so a group's label shows once. */
  groupLabels?: boolean;
}) {
  let labelled: number | undefined;
  return (
    <>
      {itemsOf(fields).map((item, i) => {
        const first = 'field' in item ? item.field : item.entries[0].field;
        const group = groupLabels ? first.group : undefined;
        const header =
          group?.label !== undefined && group.id !== labelled ? (
            <SectionHeader title={group.label} />
          ) : null;
        if (group?.label !== undefined) labelled = group.id;
        return (
          <Fragment
            key={'field' in item ? `${item.field.path}-${i}` : item.key}
          >
            {header}
            {'field' in item ? (
              <Rows fields={[item.field]} format={format} ctx={ctx} />
            ) : (
              <ArrayItem entries={item.entries} format={format} ctx={ctx} />
            )}
          </Fragment>
        );
      })}
    </>
  );
}
