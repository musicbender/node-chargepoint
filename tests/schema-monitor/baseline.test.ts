import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadBaseline, saveBaseline } from '../../scripts/schema-monitor/baseline.js';
import { shapeToBaseline } from '../../scripts/schema-monitor/reconcile.js';
import { shapeOf } from '../../scripts/schema-monitor/shape.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'schema-monitor-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadBaseline', () => {
  it('returns null when no baseline file exists yet', () => {
    expect(loadBaseline(join(dir, 'missing.json'))).toBeNull();
  });

  it('round-trips a baseline through save and load', () => {
    const node = shapeToBaseline(shapeOf({ b: 1, a: { z: true, y: 'x' } }));
    const file = join(dir, 'endpoint.json');

    saveBaseline(file, node);
    expect(loadBaseline(file)).toEqual(node);
  });

  it('writes object keys in sorted order for stable git diffs', () => {
    const node = shapeToBaseline(shapeOf({ zeta: 1, alpha: 2 }));
    const file = join(dir, 'endpoint.json');
    saveBaseline(file, node);

    const raw = loadBaseline(file);
    expect(Object.keys((raw as { fields: object }).fields)).toEqual(['alpha', 'zeta']);
  });
});
