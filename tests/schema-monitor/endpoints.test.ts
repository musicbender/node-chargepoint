import { describe, expect, it } from 'vitest';
import {
  firstChargerId,
  homeChargerConfigRequest,
  homeChargerScheduleRequest,
  homeChargerStatusRequest,
  homeChargerTechnicalInfoRequest,
  homeChargersRequest,
  userChargingStatusRequest,
  vehiclesRequest,
} from '../../scripts/schema-monitor/endpoints.js';
import type { APIEndpoints } from '../../src/types.js';

const ep: APIEndpoints = {
  accountsEndpoint: 'https://account.chargepoint.com',
  internalApiGatewayEndpoint: 'https://cpapi.chargepoint.com',
  mapcacheEndpoint: 'https://mc.chargepoint.com/map-prod',
  pandaWebsocketEndpoint: 'wss://panda.chargepoint.com',
  paymentJavaEndpoint: 'https://payment.chargepoint.com',
  paymentPhpEndpoint: 'https://payment.chargepoint.com/php',
  portalDomainEndpoint: 'https://mc.chargepoint.com',
  portalSubdomain: 'mc',
  ssoEndpoint: 'https://sso.chargepoint.com',
  webservicesEndpoint: 'https://webservices.chargepoint.com',
  websocketEndpoint: 'wss://ws.chargepoint.com',
  hcpoHcmEndpoint: 'https://hcpoprodhcm.chargepoint.com',
};

describe('request builders', () => {
  it('builds the vehicles GET', () => {
    expect(vehiclesRequest(ep)).toEqual({
      method: 'GET',
      url: 'https://account.chargepoint.com/v1/driver/vehicle',
    });
  });

  it('builds the home charger schedule GET', () => {
    expect(homeChargerScheduleRequest(ep, 12345)).toEqual({
      method: 'GET',
      url: 'https://hcpoprodhcm.chargepoint.com/api/v1/schedule/charger/12345/schedule',
    });
  });

  it('builds the user charging status POST', () => {
    const spec = userChargingStatusRequest(ep);
    expect(spec.method).toBe('POST');
    expect(spec.url).toBe('https://mc.chargepoint.com/map-prod/v2');
    expect(spec.body).toMatchObject({ user_status: { timestamp: expect.any(Number) } });
  });

  it('builds the home chargers GET', () => {
    expect(homeChargersRequest(ep, 1234567890)).toEqual({
      method: 'GET',
      url: 'https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/1234567890/chargers',
    });
  });

  it('builds the home charger status GET', () => {
    expect(homeChargerStatusRequest(ep, 1234567890, 12345)).toEqual({
      method: 'GET',
      url: 'https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/1234567890/chargers/12345/status',
    });
  });

  it('builds the home charger technical info GET', () => {
    expect(homeChargerTechnicalInfoRequest(ep, 1234567890, 12345).url).toBe(
      'https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/1234567890/chargers/12345/technical-info',
    );
  });

  it('builds the home charger config GET', () => {
    expect(homeChargerConfigRequest(ep, 1234567890, 12345).url).toBe(
      'https://hcpoprodhcm.chargepoint.com/api/v1/configuration/users/1234567890/chargers/12345/configurations',
    );
  });
});

describe('firstChargerId', () => {
  it('reads the current shape ({ data: [{ id }] })', () => {
    expect(firstChargerId({ data: [{ id: '12345' }, { id: '67890' }] })).toBe(12345);
  });

  it('falls back to the older shape ({ chargers: [{ chargerId }] })', () => {
    expect(firstChargerId({ chargers: [{ chargerId: 555 }] })).toBe(555);
  });

  it('falls back to charger_id (snake_case)', () => {
    expect(firstChargerId({ chargers: [{ charger_id: 777 }] })).toBe(777);
  });

  it('returns undefined for an account with no chargers', () => {
    expect(firstChargerId({ data: [] })).toBeUndefined();
  });

  it('returns undefined for a malformed response', () => {
    expect(firstChargerId(null)).toBeUndefined();
    expect(firstChargerId('not an object')).toBeUndefined();
    expect(firstChargerId({})).toBeUndefined();
  });
});
