import type { Classification, DiffEntry, DiffKind } from './types.js';

type Severity = 'review' | 'minor' | 'patch';

const SEVERITY_BY_KIND: Record<DiffKind, Severity> = {
  typeChanged: 'review',
  added: 'minor',
  widenedRequired: 'patch',
};

export function severityOf(entry: DiffEntry): Severity {
  return SEVERITY_BY_KIND[entry.kind];
}

/**
 * Classifies a whole endpoint's (or run's) diff into one release lane, per the additive-only
 * policy: any entry that needs human review overrides everything else — the label stays unset
 * and nothing is auto-applied. Otherwise the label is the highest of what's present
 * (minor > patch).
 */
export function classifyDiff(entries: DiffEntry[]): Classification {
  if (entries.length === 0) {
    return { label: null, autoApplyable: true, needsReview: false };
  }

  const severities = entries.map(severityOf);

  if (severities.includes('review')) {
    return { label: null, autoApplyable: false, needsReview: true };
  }

  if (severities.includes('minor')) {
    return { label: 'bump:minor', autoApplyable: true, needsReview: false };
  }

  return { label: 'bump:patch', autoApplyable: true, needsReview: false };
}
