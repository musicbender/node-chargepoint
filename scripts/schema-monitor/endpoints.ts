import type { APIEndpoints } from '../../src/types.js';

/**
 * Raw request specs for the ChargePoint endpoints whose typed `ChargePoint` methods reconstruct
 * the response field-by-field (and so would silently discard any new field ChargePoint adds).
 * Kept separate from `src/client.ts` deliberately — this tooling wants the untransformed wire
 * shape, not the library's protective typed view of it.
 */
export interface RequestSpec {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
}

export function vehiclesRequest(ep: APIEndpoints): RequestSpec {
  return { method: 'GET', url: `${ep.accountsEndpoint}/v1/driver/vehicle` };
}

export function homeChargerScheduleRequest(ep: APIEndpoints, chargerId: number): RequestSpec {
  return { method: 'GET', url: `${ep.hcpoHcmEndpoint}/api/v1/schedule/charger/${chargerId}/schedule` };
}

export function userChargingStatusRequest(ep: APIEndpoints): RequestSpec {
  return {
    method: 'POST',
    url: `${ep.mapcacheEndpoint}/v2`,
    body: { user_status: { timestamp: Date.now() } },
  };
}

export function homeChargersRequest(ep: APIEndpoints, userId: number): RequestSpec {
  return { method: 'GET', url: `${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers` };
}

export function homeChargerStatusRequest(ep: APIEndpoints, userId: number, chargerId: number): RequestSpec {
  return {
    method: 'GET',
    url: `${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers/${chargerId}/status`,
  };
}

export function homeChargerTechnicalInfoRequest(ep: APIEndpoints, userId: number, chargerId: number): RequestSpec {
  return {
    method: 'GET',
    url: `${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers/${chargerId}/technical-info`,
  };
}

export function homeChargerConfigRequest(ep: APIEndpoints, userId: number, chargerId: number): RequestSpec {
  return {
    method: 'GET',
    url: `${ep.hcpoHcmEndpoint}/api/v1/configuration/users/${userId}/chargers/${chargerId}/configurations`,
  };
}

/**
 * Extracts the first home charger id from a raw `GET .../chargers` response. Mirrors
 * `ChargePoint.getHomeChargers()`'s own tolerance for the current (`data.data[].id`) and older
 * (`data.chargers[].chargerId`/`charger_id`) response shapes.
 */
export function firstChargerId(raw: unknown): number | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const arr = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.chargers) ? obj.chargers : [];
  const first = (arr as Record<string, unknown>[])[0];
  if (!first) return undefined;
  const id = first.id ?? first.chargerId ?? first.charger_id;
  const n = typeof id === 'number' ? id : Number(id);
  return Number.isFinite(n) ? n : undefined;
}
