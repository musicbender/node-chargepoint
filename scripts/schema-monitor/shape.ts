import type { Shape } from './types.js';

/** Computes the structural shape of a JSON value. Never retains a value, only its kind. */
export function shapeOf(value: unknown): Shape {
  if (value === null) return { kind: 'null' };

  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', items: { kind: 'unknown' } };
    return { kind: 'array', items: value.map(shapeOf).reduce(mergeShape) };
  }

  switch (typeof value) {
    case 'string':
      return { kind: 'string' };
    case 'number':
      return { kind: 'number' };
    case 'boolean':
      return { kind: 'boolean' };
    case 'object': {
      const fields: Record<string, Shape> = {};
      for (const key of Object.keys(value as Record<string, unknown>).sort()) {
        fields[key] = shapeOf((value as Record<string, unknown>)[key]);
      }
      return { kind: 'object', fields };
    }
    default:
      return { kind: 'unknown' };
  }
}

/**
 * Merges the shapes of two array elements into one. Used to collapse a JSON array into a single
 * representative element shape. `unknown` (an empty array's placeholder) yields to anything else.
 * Mismatched kinds — e.g. an array mixing strings and objects — fall back to `unknown` rather
 * than silently picking one; `redact.ts`/`diff.ts` treat `unknown` as "no evidence either way".
 */
export function mergeShape(a: Shape, b: Shape): Shape {
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;
  if (a.kind !== b.kind) return { kind: 'unknown' };

  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', items: mergeShape(a.items, b.items) };
  }

  if (a.kind === 'object' && b.kind === 'object') {
    const fields: Record<string, Shape> = {};
    for (const key of new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]).values()) {
      const av = a.fields[key];
      const bv = b.fields[key];
      fields[key] = av && bv ? mergeShape(av, bv) : (av ?? bv)!;
    }
    return { kind: 'object', fields: sortFields(fields) };
  }

  return a;
}

function sortFields(fields: Record<string, Shape>): Record<string, Shape> {
  const sorted: Record<string, Shape> = {};
  for (const key of Object.keys(fields).sort()) {
    sorted[key] = fields[key]!;
  }
  return sorted;
}
