import { describe, expect, it } from 'vitest';
import { reconcile, shapeToBaseline } from '../../scripts/schema-monitor/reconcile.js';
import { shapeOf } from '../../scripts/schema-monitor/shape.js';
import { DEFAULT_MISSING_THRESHOLD } from '../../scripts/schema-monitor/types.js';

describe('reconcile', () => {
  it('establishes a baseline silently on first capture (no diff entries)', () => {
    const fresh = shapeOf({ chargerId: 1, brand: 'CP' });
    const { next, entries } = reconcile(null, fresh);
    expect(entries).toEqual([]);
    expect(next).toEqual(shapeToBaseline(fresh));
  });

  it('reports nothing when the shape is unchanged', () => {
    const fresh = shapeOf({ chargerId: 1, brand: 'CP' });
    const baseline = shapeToBaseline(fresh);
    const { entries } = reconcile(baseline, fresh);
    expect(entries).toEqual([]);
  });

  it('reports a new field as "added" and marks it optional going forward', () => {
    const baseline = shapeToBaseline(shapeOf({ chargerId: 1 }));
    const fresh = shapeOf({ chargerId: 1, softwareVersion: '1.2.3' });
    const { next, entries } = reconcile(baseline, fresh);

    expect(entries).toEqual([{ path: '$.softwareVersion', kind: 'added', detail: 'new field (string)' }]);
    expect(next).toMatchObject({
      fields: { softwareVersion: { optional: true, missingStreak: 0 } },
    });
  });

  it('does not widen a required field on a single missing run', () => {
    const baseline = shapeToBaseline(shapeOf({ chargerId: 1, sessionId: 5 }));
    const fresh = shapeOf({ chargerId: 1 }); // sessionId absent — car isn't charging today
    const { next, entries } = reconcile(baseline, fresh);

    expect(entries).toEqual([]);
    expect(next).toMatchObject({ fields: { sessionId: { optional: false, missingStreak: 1 } } });
  });

  it('widens a required field to optional once absent for the full threshold', () => {
    let baseline = shapeToBaseline(shapeOf({ chargerId: 1, sessionId: 5 }));
    const missingCapture = shapeOf({ chargerId: 1 });
    let entries: import('../../scripts/schema-monitor/types.js').DiffEntry[] = [];

    for (let i = 0; i < DEFAULT_MISSING_THRESHOLD; i++) {
      const result = reconcile(baseline, missingCapture);
      baseline = result.next;
      entries = result.entries;
    }

    expect(entries).toEqual([
      {
        path: '$.sessionId',
        kind: 'widenedRequired',
        detail: `missing for ${DEFAULT_MISSING_THRESHOLD} consecutive runs — widen to optional`,
      },
    ]);
    expect(baseline).toMatchObject({ fields: { sessionId: { optional: true, missingStreak: 0 } } });
  });

  it('never re-flags a field that is already optional when it goes missing', () => {
    const baselineNode = shapeToBaseline(shapeOf({ chargerId: 1 }));
    if (baselineNode.kind !== 'object') throw new Error('unreachable');
    baselineNode.fields.sessionId = { node: { kind: 'number' }, optional: true, missingStreak: 0 };
    const baseline = baselineNode;
    const fresh = shapeOf({ chargerId: 1 }); // sessionId absent, as usual

    const { entries } = reconcile(baseline, fresh);
    expect(entries).toEqual([]);
  });

  it('flags a type change on an existing field and never auto-adopts it', () => {
    const baseline = shapeToBaseline(shapeOf({ amperageLimit: 32 }));
    const fresh = shapeOf({ amperageLimit: '32' }); // API started sending a string
    const { next, entries } = reconcile(baseline, fresh);

    expect(entries).toEqual([{ path: '$.amperageLimit', kind: 'typeChanged', detail: 'number -> string' }]);
    expect(next).toEqual(baseline); // unchanged — waits for a human to update it
  });

  it('recurses into nested objects and arrays', () => {
    const baseline = shapeToBaseline(
      shapeOf({ utility: { name: 'Austin Energy', plans: [{ id: 1, isEvPlan: true }] } }),
    );
    const fresh = shapeOf({ utility: { name: 'Austin Energy', plans: [{ id: 1, isEvPlan: true, code: 'EV1' }] } });
    const { entries } = reconcile(baseline, fresh);

    expect(entries).toEqual([{ path: '$.utility.plans[].code', kind: 'added', detail: 'new field (string)' }]);
  });

  it('treats an empty array as no evidence in either direction', () => {
    const baseline = shapeToBaseline(shapeOf({ plans: [] }));
    const fresh = shapeOf({ plans: [{ id: 1 }] });
    const first = reconcile(baseline, fresh);
    expect(first.entries).toEqual([]); // adopting real shape from "unknown" isn't a diff

    const second = reconcile(first.next, shapeOf({ plans: [] }));
    expect(second.entries).toEqual([]); // an empty array this run isn't evidence of removal
    expect(second.next).toEqual(first.next);
  });
});
