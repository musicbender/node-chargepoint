import { describe, expect, it } from 'vitest';
import { classifyDiff } from '../../scripts/schema-monitor/classify.js';
import { renderReport } from '../../scripts/schema-monitor/report.js';
import type { EndpointDiff } from '../../scripts/schema-monitor/types.js';

describe('renderReport', () => {
  it('renders a safe additive diff with its suggested label and no draft banner', () => {
    const diffs: EndpointDiff[] = [
      {
        endpoint: 'home-charger-technical-info',
        entries: [{ path: '$.softwareVersion', kind: 'added', detail: 'new field (string)' }],
      },
    ];
    const report = renderReport(diffs, classifyDiff(diffs.flatMap((d) => d.entries)));

    expect(report).toContain('Suggested label: `bump:minor`');
    expect(report).toContain('`home-charger-technical-info`');
    expect(report).toContain('$.softwareVersion');
    expect(report).not.toContain('breaking');
  });

  it('renders a needs-review diff with the draft banner and no label', () => {
    const diffs: EndpointDiff[] = [
      {
        endpoint: 'home-charger-status',
        entries: [{ path: '$.amperageLimit', kind: 'typeChanged', detail: 'number -> string' }],
      },
    ];
    const report = renderReport(diffs, classifyDiff(diffs.flatMap((d) => d.entries)));

    expect(report).toContain('Possible breaking change detected');
    expect(report).toContain('draft');
    expect(report).not.toContain('Suggested label');
  });

  it('skips endpoints with no entries', () => {
    const diffs: EndpointDiff[] = [
      { endpoint: 'account', entries: [] },
      { endpoint: 'vehicles', entries: [{ path: '$.color', kind: 'added', detail: 'new field (string)' }] },
    ];
    const report = renderReport(diffs, classifyDiff(diffs.flatMap((d) => d.entries)));

    expect(report).not.toContain('`account`');
    expect(report).toContain('`vehicles`');
  });
});
