import type { ChargePoint } from '../../src/client.js';
import { DatadomeCaptcha, InvalidSession } from '../../src/exceptions.js';
import { captureGlobalConfig } from './discovery.js';
import {
  firstChargerId,
  homeChargerConfigRequest,
  homeChargerScheduleRequest,
  homeChargerStatusRequest,
  homeChargerTechnicalInfoRequest,
  homeChargersRequest,
  userChargingStatusRequest,
  vehiclesRequest,
  type RequestSpec,
} from './endpoints.js';
import type { EndpointCapture } from './types.js';

export interface CaptureOptions {
  /** Called when a best-effort (charger-specific) endpoint fails without aborting the run. */
  onWarning?: (message: string) => void;
}

async function fetchRaw(client: ChargePoint, spec: RequestSpec): Promise<unknown> {
  const init: RequestInit =
    spec.body !== undefined
      ? { body: JSON.stringify(spec.body), headers: { 'Content-Type': 'application/json' } }
      : {};
  const response = await client._request(spec.method, spec.url, init);
  if (!response.ok) {
    throw new Error(`${spec.method} ${spec.url} -> HTTP ${response.status}`);
  }
  return response.json();
}

/** Re-throws auth-level failures (the run should stop), swallows everything else as best-effort. */
async function bestEffort<T>(name: string, warn: (message: string) => void, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof InvalidSession || err instanceof DatadomeCaptcha) throw err;
    warn(`Skipping "${name}": ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

/**
 * Captures raw JSON from every endpoint the monitor tracks. Auth failures (`InvalidSession`,
 * `DatadomeCaptcha`) propagate and should stop the run — everything else about a single
 * charger-specific endpoint is best-effort so one flaky endpoint doesn't block the rest.
 */
export async function captureAll(client: ChargePoint, options: CaptureOptions = {}): Promise<EndpointCapture[]> {
  const warn = options.onWarning ?? ((): void => {});
  const results: EndpointCapture[] = [];

  const globalConfigRaw = await captureGlobalConfig();
  results.push({ endpoint: 'global-config', data: globalConfigRaw });

  // getAccount() is a direct `as Account` cast with no unwrapping — safe to reuse as-is.
  const account = await client.getAccount();
  results.push({ endpoint: 'account', data: account });
  const userId = account.user.userId;

  // Everything else below reconstructs or unwraps the response in its typed method (discarding
  // a wrapper key, sibling fields, or individual fields not enumerated) — captured raw instead.
  const ep = client.globalConfig.endpoints;

  const vehiclesRaw = await fetchRaw(client, vehiclesRequest(ep));
  results.push({ endpoint: 'vehicles', data: vehiclesRaw });

  const userChargingStatusRaw = await bestEffort('user-charging-status', warn, () =>
    fetchRaw(client, userChargingStatusRequest(ep)),
  );
  if (userChargingStatusRaw !== undefined) {
    results.push({ endpoint: 'user-charging-status', data: userChargingStatusRaw });
  }

  const homeChargersRaw = await fetchRaw(client, homeChargersRequest(ep, userId));
  results.push({ endpoint: 'home-chargers', data: homeChargersRaw });

  const chargerId = firstChargerId(homeChargersRaw);
  if (chargerId === undefined) {
    warn('No home chargers on this account — skipping charger-specific endpoints.');
    return results;
  }

  const chargerEndpoints: [string, () => Promise<unknown>][] = [
    ['home-charger-status', () => fetchRaw(client, homeChargerStatusRequest(ep, userId, chargerId))],
    ['home-charger-technical-info', () => fetchRaw(client, homeChargerTechnicalInfoRequest(ep, userId, chargerId))],
    ['home-charger-config', () => fetchRaw(client, homeChargerConfigRequest(ep, userId, chargerId))],
    ['home-charger-schedule', () => fetchRaw(client, homeChargerScheduleRequest(ep, chargerId))],
  ];

  for (const [endpoint, fn] of chargerEndpoints) {
    const data = await bestEffort(endpoint, warn, fn);
    if (data !== undefined) results.push({ endpoint, data });
  }

  return results;
}
