import { describe, expect, it } from 'vitest';
import { assertRedacted, ShapeLeakError } from '../../scripts/schema-monitor/redact.js';
import { shapeOf } from '../../scripts/schema-monitor/shape.js';

describe('assertRedacted', () => {
  it('passes for ordinary field names', () => {
    const shape = shapeOf({ chargerId: 1, utility: { name: 'x', plans: [{ id: 1 }] } });
    expect(() => assertRedacted(shape)).not.toThrow();
  });

  it('throws when an object key is an all-digit id', () => {
    const shape = shapeOf({ '123456789': { status: 'ok' } });
    expect(() => assertRedacted(shape)).toThrow(ShapeLeakError);
  });

  it('throws when an object key is a UUID', () => {
    const shape = shapeOf({ '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d': { status: 'ok' } });
    expect(() => assertRedacted(shape)).toThrow(ShapeLeakError);
  });

  it('throws when an object key is a long hex token', () => {
    const shape = shapeOf({ ['a'.repeat(32)]: { status: 'ok' } });
    expect(() => assertRedacted(shape)).toThrow(ShapeLeakError);
  });

  it('throws when a suspicious key is nested inside an array', () => {
    const shape = shapeOf([{ '999999999': true }]);
    expect(() => assertRedacted(shape)).toThrow(ShapeLeakError);
  });

  it('reports the offending path and key', () => {
    const shape = shapeOf({ outer: { '42': true } });
    try {
      assertRedacted(shape);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ShapeLeakError);
      expect((err as InstanceType<typeof ShapeLeakError>).key).toBe('42');
      expect((err as InstanceType<typeof ShapeLeakError>).path).toBe('$.outer');
    }
  });
});
