import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';
import { ChargePoint } from '../../src/client.js';
import { InvalidSession } from '../../src/exceptions.js';
import { loadBaseline } from '../../scripts/schema-monitor/baseline.js';
import { runOnce } from '../../scripts/schema-monitor/run.js';
import { TEST_TOKEN } from '../handlers.js';

let baselineDir: string;

beforeEach(() => {
  baselineDir = mkdtempSync(join(tmpdir(), 'schema-monitor-run-'));
});

afterEach(() => {
  rmSync(baselineDir, { recursive: true, force: true });
});

async function authenticatedClient(): Promise<ChargePoint> {
  return ChargePoint.create('testuser', { coulombToken: TEST_TOKEN });
}

describe('runOnce', () => {
  it('establishes the baseline on first run with no diff (nothing to compare against yet)', async () => {
    const client = await authenticatedClient();
    const outcome = await runOnce(client, { baselineDir });

    expect(outcome).toEqual({ status: 'no-change' });
    expect(loadBaseline(join(baselineDir, 'account.json'))).not.toBeNull();
  });

  it('reports no-change on a second run against an identical capture', async () => {
    const client = await authenticatedClient();
    await runOnce(client, { baselineDir });
    const outcome = await runOnce(client, { baselineDir });

    expect(outcome).toEqual({ status: 'no-change' });
  });

  it('reports a purely additive diff as bump:minor and does not need review', async () => {
    const client = await authenticatedClient();
    await runOnce(client, { baselineDir });

    server.use(
      http.get('https://account.chargepoint.com/v1/driver/profile/user', () =>
        HttpResponse.json({
          user: {
            userId: 1234567890,
            email: 'test@example.com',
            username: 'testuser',
            fullName: 'Test User',
            givenName: 'Test',
            familyName: 'User',
            phone: '555-555-1234',
            phoneCountryId: 1,
            evatarUrl: 'https://example.com/avatar.jpg',
            loyaltyTier: 'gold', // new field ChargePoint started sending
          },
          accountBalance: {
            accountNumber: '9876543210',
            accountState: 'ACTIVE',
            balance: { currency: 'USD', amount: '25.00' },
          },
        }),
      ),
    );

    const outcome = await runOnce(client, { baselineDir });
    expect(outcome.status).toBe('changed');
    if (outcome.status !== 'changed') throw new Error('unreachable');
    expect(outcome.classification).toEqual({ label: 'bump:minor', autoApplyable: true, needsReview: false });
    const accountDiff = outcome.diffs.find((d) => d.endpoint === 'account');
    expect(accountDiff?.entries).toEqual([
      { path: '$.user.loyaltyTier', kind: 'added', detail: 'new field (string)' },
    ]);
  });

  it('flags a type change on an existing field as needing review, with no label', async () => {
    const client = await authenticatedClient();
    await runOnce(client, { baselineDir });

    server.use(
      http.get(
        'https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/1234567890/chargers/12345/status',
        () =>
          HttpResponse.json({
            brand: 'CP',
            model: 'HOME FLEX',
            macAddress: 'AA:BB:CC:DD:EE:FF',
            chargingStatus: 'AVAILABLE',
            isPluggedIn: true,
            isConnected: true,
            isReminderEnabled: false,
            plugInReminderTime: '',
            hasUtilityInfo: false,
            isDuringScheduledTime: false,
            chargeAmperageSettings: {
              chargeLimit: '28', // was a number, now a string
              possibleChargeLimit: [20, 21, 22],
            },
          }),
      ),
    );

    const outcome = await runOnce(client, { baselineDir });
    expect(outcome.status).toBe('changed');
    if (outcome.status !== 'changed') throw new Error('unreachable');
    expect(outcome.classification.needsReview).toBe(true);
    expect(outcome.classification.label).toBeNull();
    expect(outcome.classification.autoApplyable).toBe(false);
  });

  it('propagates an auth error instead of writing a baseline', async () => {
    server.use(
      http.get('https://account.chargepoint.com/v1/driver/profile/user', () => new HttpResponse(null, { status: 401 })),
    );
    const client = await authenticatedClient();

    await expect(runOnce(client, { baselineDir })).rejects.toBeInstanceOf(InvalidSession);
  });

  it('leaves an endpoint\'s baseline untouched when its capture fails (best-effort)', async () => {
    const client = await authenticatedClient();
    await runOnce(client, { baselineDir });
    const before = loadBaseline(join(baselineDir, 'user-charging-status.json'));

    server.use(http.post('https://mc.chargepoint.com/map-prod/v2', () => new HttpResponse(null, { status: 500 })));

    const outcome = await runOnce(client, { baselineDir });
    expect(outcome).toEqual({ status: 'no-change' });
    expect(loadBaseline(join(baselineDir, 'user-charging-status.json'))).toEqual(before);
  });

  it('does not widen a required field after a single missing run', async () => {
    const client = await authenticatedClient();
    await runOnce(client, { baselineDir });

    server.use(
      http.get(
        'https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/1234567890/chargers/12345/technical-info',
        () =>
          HttpResponse.json({
            modelNumber: 'CPH50-NEMA6-50-L23',
            serialNumber: 'SN123',
            wifiMac: 'AA:BB',
            macAddress: 'CC:DD',
            softwareVersion: '1.2.3.4',
            lastOtaUpdate: '2024-01-01',
            lastConnectedAt: '2024-06-01T08:30:00Z',
            // deviceIp omitted this run
            stopChargeSupported: true,
          }),
      ),
    );

    const outcome = await runOnce(client, { baselineDir });
    expect(outcome).toEqual({ status: 'no-change' });
    const baseline = loadBaseline(join(baselineDir, 'home-charger-technical-info.json'));
    expect(baseline).toMatchObject({ fields: { deviceIp: { optional: false, missingStreak: 1 } } });
  });

  it('is deterministic — writing the same baseline twice produces byte-identical files', async () => {
    const client = await authenticatedClient();
    await runOnce(client, { baselineDir });
    const file = join(baselineDir, 'account.json');
    const before = loadBaseline(file);

    await runOnce(client, { baselineDir });
    const after = loadBaseline(file);

    expect(after).toEqual(before);
  });
});
