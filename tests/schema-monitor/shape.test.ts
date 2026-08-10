import { describe, expect, it } from 'vitest';
import { shapeOf, mergeShape } from '../../scripts/schema-monitor/shape.js';

describe('shapeOf', () => {
  it('classifies primitives', () => {
    expect(shapeOf('hello')).toEqual({ kind: 'string' });
    expect(shapeOf(42)).toEqual({ kind: 'number' });
    expect(shapeOf(true)).toEqual({ kind: 'boolean' });
    expect(shapeOf(null)).toEqual({ kind: 'null' });
  });

  it('sorts object keys deterministically', () => {
    const a = shapeOf({ b: 1, a: 2 });
    const b = shapeOf({ a: 2, b: 1 });
    expect(Object.keys((a as { fields: object }).fields)).toEqual(['a', 'b']);
    expect(a).toEqual(b);
  });

  it('never retains the actual value, only the kind', () => {
    const shape = shapeOf({ email: 'user@example.com', userId: 123456789 });
    expect(JSON.stringify(shape)).not.toContain('user@example.com');
    expect(JSON.stringify(shape)).not.toContain('123456789');
  });

  it('recurses into nested objects', () => {
    expect(shapeOf({ utility: { name: 'Austin Energy', plans: [] } })).toEqual({
      kind: 'object',
      fields: {
        utility: {
          kind: 'object',
          fields: {
            name: { kind: 'string' },
            plans: { kind: 'array', items: { kind: 'unknown' } },
          },
        },
      },
    });
  });

  it('merges array element shapes into one representative shape', () => {
    const shape = shapeOf([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
    expect(shape).toEqual({
      kind: 'array',
      items: { kind: 'object', fields: { id: { kind: 'number' }, name: { kind: 'string' } } },
    });
  });

  it('unions fields across heterogeneous array elements', () => {
    const shape = shapeOf([{ a: 1 }, { b: 'x' }]);
    expect(shape).toEqual({
      kind: 'array',
      items: { kind: 'object', fields: { a: { kind: 'number' }, b: { kind: 'string' } } },
    });
  });

  it('empty array yields unknown items', () => {
    expect(shapeOf([])).toEqual({ kind: 'array', items: { kind: 'unknown' } });
  });
});

describe('mergeShape', () => {
  it('unknown yields to a concrete shape on either side', () => {
    const s: import('../../scripts/schema-monitor/types.js').Shape = { kind: 'string' };
    expect(mergeShape({ kind: 'unknown' }, s)).toEqual(s);
    expect(mergeShape(s, { kind: 'unknown' })).toEqual(s);
  });

  it('falls back to unknown on a genuine kind mismatch', () => {
    expect(mergeShape({ kind: 'string' }, { kind: 'number' })).toEqual({ kind: 'unknown' });
  });
});
