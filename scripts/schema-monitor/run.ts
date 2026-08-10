import { join } from 'node:path';
import { ChargePoint } from '../../src/client.js';
import { DatadomeCaptcha, InvalidSession, LoginError } from '../../src/exceptions.js';
import { loadBaseline, saveBaseline } from './baseline.js';
import { captureAll } from './capture.js';
import { classifyDiff } from './classify.js';
import { assertRedacted } from './redact.js';
import { reconcile } from './reconcile.js';
import { renderReport } from './report.js';
import { shapeOf } from './shape.js';
import { DEFAULT_MISSING_THRESHOLD, type EndpointDiff, type RunOutcome } from './types.js';

export interface RunOnceOptions {
  baselineDir: string;
  threshold?: number;
  onWarning?: (message: string) => void;
}

/**
 * Captures every tracked endpoint, reconciles each against its committed baseline, and writes
 * the (possibly unchanged) baseline files back to `baselineDir`. Whether those writes actually
 * changed anything on disk is left for the caller to check with `git status` — this function's
 * `RunOutcome` only says whether there's a human-relevant diff.
 */
export async function runOnce(client: ChargePoint, options: RunOnceOptions): Promise<RunOutcome> {
  const { baselineDir, threshold = DEFAULT_MISSING_THRESHOLD, onWarning = (): void => {} } = options;

  const captures = await captureAll(client, { onWarning });
  const diffs: EndpointDiff[] = [];

  for (const capture of captures) {
    const shape = shapeOf(capture.data);
    // A leak here means a value slipped into an object key (see redact.ts) — never write it,
    // never continue the run silently.
    assertRedacted(shape);

    const file = join(baselineDir, `${capture.endpoint}.json`);
    const existing = loadBaseline(file);
    const { next, entries } = reconcile(existing, shape, threshold);

    saveBaseline(file, next);
    if (entries.length > 0) {
      diffs.push({ endpoint: capture.endpoint, entries });
    }
  }

  if (diffs.length === 0) {
    return { status: 'no-change' };
  }

  return { status: 'changed', diffs, classification: classifyDiff(diffs.flatMap((d) => d.entries)) };
}

async function createClient(): Promise<ChargePoint> {
  const username = process.env['CP_USERNAME'];
  const token = process.env['CP_TOKEN'];
  const password = process.env['CP_PASSWORD'];

  if (!username) {
    throw new Error('CP_USERNAME is required.');
  }
  if (!token && !password) {
    throw new Error('Either CP_TOKEN or CP_PASSWORD must be set.');
  }

  const client = await ChargePoint.create(username, token ? { coulombToken: token } : {});
  if (!token) {
    await client.loginWithPassword(password!);
  }
  return client;
}

async function main(): Promise<void> {
  const baselineDir = process.env['SCHEMA_BASELINE_DIR'] ?? 'api-schema';

  let client: ChargePoint;
  try {
    client = await createClient();
  } catch (err) {
    if (err instanceof InvalidSession || err instanceof DatadomeCaptcha || err instanceof LoginError) {
      console.log(JSON.stringify({ status: 'auth-error', message: err.message }));
      process.exitCode = 3;
      return;
    }
    throw err;
  }

  let outcome: RunOutcome;
  try {
    outcome = await runOnce(client, {
      baselineDir,
      onWarning: (message) => console.warn(`[schema-monitor] ${message}`),
    });
  } catch (err) {
    if (err instanceof InvalidSession || err instanceof DatadomeCaptcha) {
      console.log(JSON.stringify({ status: 'auth-error', message: err.message }));
      process.exitCode = 3;
      return;
    }
    throw err;
  }

  if (outcome.status === 'no-change') {
    console.log(JSON.stringify(outcome));
    process.exitCode = 0;
    return;
  }

  if (outcome.status === 'auth-error') {
    console.log(JSON.stringify(outcome));
    process.exitCode = 3;
    return;
  }

  const report = renderReport(outcome.diffs, outcome.classification);
  console.log(JSON.stringify({ ...outcome, report }));
  process.exitCode = 2; // "changed" — the workflow hands off to Claude for a PR
}

// Only run when executed directly (`pnpm schema:check`) — not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
