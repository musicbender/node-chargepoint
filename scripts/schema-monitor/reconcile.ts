import type { BaselineField, BaselineNode, DiffEntry, Shape } from './types.js';
import { DEFAULT_MISSING_THRESHOLD } from './types.js';

export interface ReconcileResult {
  next: BaselineNode;
  entries: DiffEntry[];
}

/**
 * Converts a fresh `Shape` into a brand-new `BaselineNode` tree: every object field starts
 * required (`optional: false`) with a clean streak, since this is the first time we've seen it.
 */
export function shapeToBaseline(shape: Shape): BaselineNode {
  if (shape.kind === 'array') {
    return { kind: 'array', items: shapeToBaseline(shape.items) };
  }
  if (shape.kind === 'object') {
    const fields: Record<string, BaselineField> = {};
    for (const key of Object.keys(shape.fields).sort()) {
      fields[key] = { node: shapeToBaseline(shape.fields[key]!), optional: false, missingStreak: 0 };
    }
    return { kind: 'object', fields };
  }
  return { kind: shape.kind };
}

/**
 * Merges a fresh capture into the existing baseline for one endpoint, producing the updated
 * baseline plus the list of changes worth telling a human about.
 *
 * `baseline === null` means this endpoint has never been captured before — the fresh shape just
 * becomes the baseline with no diff entries (nothing to compare against yet).
 */
export function reconcile(
  baseline: BaselineNode | null,
  fresh: Shape,
  threshold: number = DEFAULT_MISSING_THRESHOLD,
): ReconcileResult {
  if (baseline === null) {
    return { next: shapeToBaseline(fresh), entries: [] };
  }
  return reconcileNode(baseline, fresh, '$', threshold);
}

function reconcileNode(baseline: BaselineNode, fresh: Shape, path: string, threshold: number): ReconcileResult {
  // 'unknown' means "no evidence" (an empty array seen at this point) — never a real signal.
  if (baseline.kind === 'unknown') return { next: shapeToBaseline(fresh), entries: [] };
  if (fresh.kind === 'unknown') return { next: baseline, entries: [] };

  if (baseline.kind !== fresh.kind) {
    return {
      next: baseline, // keep re-reporting until a human's PR updates the baseline
      entries: [{ path, kind: 'typeChanged', detail: `${baseline.kind} -> ${fresh.kind}` }],
    };
  }

  if (baseline.kind === 'array' && fresh.kind === 'array') {
    const child = reconcileNode(baseline.items, fresh.items, `${path}[]`, threshold);
    return { next: { kind: 'array', items: child.next }, entries: child.entries };
  }

  if (baseline.kind === 'object' && fresh.kind === 'object') {
    return reconcileObject(baseline, fresh, path, threshold);
  }

  // Same primitive kind on both sides.
  return { next: baseline, entries: [] };
}

function reconcileObject(
  baseline: Extract<BaselineNode, { kind: 'object' }>,
  fresh: Extract<Shape, { kind: 'object' }>,
  path: string,
  threshold: number,
): ReconcileResult {
  const entries: DiffEntry[] = [];
  const fields: Record<string, BaselineField> = {};
  const keys = new Set([...Object.keys(baseline.fields), ...Object.keys(fresh.fields)]);

  for (const key of Array.from(keys).sort()) {
    const childPath = `${path}.${key}`;
    const existing = baseline.fields[key];
    const freshChild = fresh.fields[key];

    if (!existing) {
      // Brand-new field — always introduced as optional, per the additive-only policy.
      entries.push({ path: childPath, kind: 'added', detail: `new field (${freshChild!.kind})` });
      fields[key] = { node: shapeToBaseline(freshChild!), optional: true, missingStreak: 0 };
      continue;
    }

    if (!freshChild) {
      // Present in the baseline, absent this run.
      if (existing.optional) {
        fields[key] = { ...existing, missingStreak: 0 };
        continue;
      }
      const missingStreak = existing.missingStreak + 1;
      if (missingStreak >= threshold) {
        entries.push({
          path: childPath,
          kind: 'widenedRequired',
          detail: `missing for ${missingStreak} consecutive runs — widen to optional`,
        });
        fields[key] = { ...existing, optional: true, missingStreak: 0 };
      } else {
        fields[key] = { ...existing, missingStreak };
      }
      continue;
    }

    // Present in both — recurse.
    const child = reconcileNode(existing.node, freshChild, childPath, threshold);
    entries.push(...child.entries);
    fields[key] = { node: child.next, optional: existing.optional, missingStreak: 0 };
  }

  return { next: { kind: 'object', fields }, entries };
}
