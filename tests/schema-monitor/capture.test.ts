import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../setup.js';
import { ChargePoint } from '../../src/client.js';
import { InvalidSession } from '../../src/exceptions.js';
import { captureAll } from '../../scripts/schema-monitor/capture.js';
import { TEST_TOKEN, TEST_USER_ID, TEST_CHARGER_ID } from '../handlers.js';
import homeChargersFixture from '../fixtures/home-chargers.json' with { type: 'json' };
import vehiclesFixture from '../fixtures/vehicles.json' with { type: 'json' };

async function authenticatedClient(): Promise<ChargePoint> {
  return ChargePoint.create('testuser', { coulombToken: TEST_TOKEN });
}

describe('captureAll', () => {
  it('captures every tracked endpoint by name', async () => {
    const client = await authenticatedClient();
    const results = await captureAll(client);
    const endpoints = results.map((r) => r.endpoint).sort();

    expect(endpoints).toEqual(
      [
        'global-config',
        'account',
        'vehicles',
        'user-charging-status',
        'home-chargers',
        'home-charger-status',
        'home-charger-technical-info',
        'home-charger-config',
        'home-charger-schedule',
      ].sort(),
    );
  });

  it('captures raw home-chargers data, not the library-narrowed number[]', async () => {
    const client = await authenticatedClient();
    const results = await captureAll(client);
    const homeChargers = results.find((r) => r.endpoint === 'home-chargers');
    expect(homeChargers?.data).toEqual(homeChargersFixture);
  });

  it('captures the raw wrapped vehicles response, not the library-unwrapped array', async () => {
    const client = await authenticatedClient();
    const results = await captureAll(client);
    const vehicles = results.find((r) => r.endpoint === 'vehicles');
    // getVehicles() unwraps this to a bare array, discarding the "vehicles" key and any
    // siblings — capturing raw is what lets the monitor notice if that wrapper ever changes.
    expect(vehicles?.data).toEqual(vehiclesFixture);
    expect(vehicles?.data).toHaveProperty('vehicles');
  });

  it('propagates InvalidSession instead of swallowing it', async () => {
    server.use(
      http.get(
        `https://account.chargepoint.com/v1/driver/profile/user`,
        () => new HttpResponse(null, { status: 401 }),
      ),
    );
    const client = await authenticatedClient();
    await expect(captureAll(client)).rejects.toBeInstanceOf(InvalidSession);
  });

  it('skips charger-specific endpoints and warns when the account has no home chargers', async () => {
    server.use(
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers`,
        () => HttpResponse.json({ data: [] }),
      ),
    );
    const client = await authenticatedClient();
    const onWarning = vi.fn();
    const results = await captureAll(client, { onWarning });

    expect(results.some((r) => r.endpoint === 'home-charger-status')).toBe(false);
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('No home chargers'));
  });

  it('is best-effort for a single failing charger endpoint — the rest still complete', async () => {
    server.use(
      http.get(
        `https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/${TEST_USER_ID}/chargers/${TEST_CHARGER_ID}/technical-info`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const client = await authenticatedClient();
    const onWarning = vi.fn();
    const results = await captureAll(client, { onWarning });

    expect(results.some((r) => r.endpoint === 'home-charger-technical-info')).toBe(false);
    expect(results.some((r) => r.endpoint === 'home-charger-status')).toBe(true);
    expect(results.some((r) => r.endpoint === 'home-charger-schedule')).toBe(true);
    expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('home-charger-technical-info'));
  });
});
