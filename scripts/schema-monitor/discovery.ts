import https from 'node:https';
import { DISCOVERY_API, USER_AGENT } from '../../src/constants.js';

/**
 * Captures the raw (unparsed) discovery response. Deliberately bypasses `fetchGlobalConfig()` —
 * that function extracts only the endpoint keys `src/global-config.ts` already knows about, so
 * it can't surface a *new* top-level key ChargePoint starts returning. Mirrors the private
 * `postJson` helper in `src/global-config.ts` (same `node:https` workaround for Node's `fetch`
 * auto-adding `Sec-Fetch-Mode: cors`, which the discovery endpoint 500s on) — that helper isn't
 * exported, so this is a small intentional duplication rather than reaching into library internals.
 */
export async function captureGlobalConfig(region = 'NA'): Promise<unknown> {
  const body = Buffer.from(JSON.stringify({ regionCode: region }), 'utf-8');

  return new Promise((resolve, reject) => {
    const req = https.request(
      DISCOVERY_API,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': body.byteLength,
          'User-Agent': USER_AGENT,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Discovery endpoint returned HTTP ${status}`));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')));
          } catch (err) {
            reject(new Error(`Failed to parse discovery response: ${(err as Error).message}`));
          }
        });
      },
    );
    req.on('error', (err: Error) => {
      reject(new Error(`Failed to reach ChargePoint discovery API: ${err.message}`));
    });
    req.write(body);
    req.end();
  });
}
