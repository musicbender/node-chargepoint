import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChargePoint } from '../../src/client.js';

function loadEnvFile(filename: string): void {
  const filePath = resolve(process.cwd(), filename);
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, 'utf-8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnvFile('.env.e2e');

export interface E2EContext {
  client: ChargePoint;
  chargerId: number | undefined;
}

export async function createAuthenticatedClient(): Promise<E2EContext> {
  const username = process.env['CP_USERNAME'];
  const password = process.env['CP_PASSWORD'];
  const token = process.env['CP_TOKEN'];

  if (!username) {
    throw new Error('[E2E] CP_USERNAME is required. Set it in .env.e2e or export it in your shell.');
  }

  const client = await ChargePoint.create(username, token ? { coulombToken: token } : {});

  if (!token) {
    if (!password) {
      throw new Error('[E2E] Either CP_TOKEN or CP_PASSWORD must be set. Set them in .env.e2e or export them in your shell.');
    }
    await client.loginWithPassword(password);
  }

  console.log('\n[E2E] coulombToken (set CP_TOKEN= to this to skip re-login):');
  console.log(`      ${client.coulombToken ?? '(none — something went wrong)'}\n`);

  const chargerIds = await client.getHomeChargers();
  return { client, chargerId: chargerIds[0] };
}
