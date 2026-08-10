import { describe, expect, it } from 'vitest';
import { classifyDiff } from '../../scripts/schema-monitor/classify.js';
import type { DiffEntry } from '../../scripts/schema-monitor/types.js';

const added: DiffEntry = { path: '$.softwareVersion', kind: 'added', detail: 'new field (string)' };
const widened: DiffEntry = { path: '$.sessionId', kind: 'widenedRequired', detail: 'missing for 3 runs' };
const typeChanged: DiffEntry = { path: '$.amperageLimit', kind: 'typeChanged', detail: 'number -> string' };

describe('classifyDiff', () => {
  it('is a safe no-op for an empty diff', () => {
    expect(classifyDiff([])).toEqual({ label: null, autoApplyable: true, needsReview: false });
  });

  it('labels a purely additive diff as bump:minor', () => {
    expect(classifyDiff([added])).toEqual({ label: 'bump:minor', autoApplyable: true, needsReview: false });
  });

  it('labels a widen-only diff as bump:patch', () => {
    expect(classifyDiff([widened])).toEqual({ label: 'bump:patch', autoApplyable: true, needsReview: false });
  });

  it('prefers minor over patch when both are present', () => {
    expect(classifyDiff([widened, added]).label).toBe('bump:minor');
  });

  it('never auto-applies or sets a label when anything needs review', () => {
    expect(classifyDiff([typeChanged])).toEqual({ label: null, autoApplyable: false, needsReview: true });
  });

  it('a single typeChanged entry overrides an otherwise-safe diff', () => {
    expect(classifyDiff([added, widened, typeChanged])).toEqual({
      label: null,
      autoApplyable: false,
      needsReview: true,
    });
  });
});
