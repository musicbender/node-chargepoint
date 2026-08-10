import { severityOf } from './classify.js';
import type { Classification, EndpointDiff } from './types.js';

const ICON = { review: '⚠️', minor: '✨', patch: '🩹' } as const;

/** Renders a diff + its classification as the Markdown body for the drift PR. */
export function renderReport(diffs: EndpointDiff[], classification: Classification): string {
  const lines: string[] = [];

  if (classification.needsReview) {
    lines.push(
      '> **Possible breaking change detected.** At least one field changed in a way the ' +
        'additive-only policy will not auto-apply — see the `typeChanged` entries below. This PR ' +
        'is opened as a **draft**; no version label is set. A human decides how `src/types.ts` ' +
        'should change.',
      '',
    );
  } else {
    lines.push(
      `Purely additive drift detected in the live ChargePoint API. Suggested label: ` +
        `\`${classification.label}\`.`,
      '',
    );
  }

  for (const { endpoint, entries } of diffs) {
    if (entries.length === 0) continue;
    lines.push(`### \`${endpoint}\``, '');
    for (const entry of entries) {
      lines.push(`- ${ICON[severityOf(entry)]} **${entry.kind}** \`${entry.path}\` — ${entry.detail}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}
