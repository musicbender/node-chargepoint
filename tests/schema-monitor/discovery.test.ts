import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { captureGlobalConfig } from '../../scripts/schema-monitor/discovery.js';
import { server } from '../setup.js';
import globalConfigFixture from '../fixtures/global-config.json' with { type: 'json' };

describe('captureGlobalConfig', () => {
  it('returns the raw discovery response untouched', async () => {
    const raw = await captureGlobalConfig();
    expect(raw).toEqual(globalConfigFixture);
  });

  it('surfaces a top-level key that fetchGlobalConfig would otherwise discard', async () => {
    server.use(
      http.post('https://discovery.chargepoint.com/discovery/v3/globalconfig', () =>
        HttpResponse.json({ ...globalConfigFixture, newTopLevelFeatureFlag: true }),
      ),
    );
    const raw = await captureGlobalConfig();
    expect(raw).toMatchObject({ newTopLevelFeatureFlag: true });
  });

  it('rejects on a non-2xx response', async () => {
    server.use(
      http.post('https://discovery.chargepoint.com/discovery/v3/globalconfig', () =>
        new HttpResponse(null, { status: 500 }),
      ),
    );
    await expect(captureGlobalConfig()).rejects.toThrow('HTTP 500');
  });
});
