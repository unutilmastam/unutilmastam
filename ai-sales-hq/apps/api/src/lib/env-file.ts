import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads KEY=VALUE pairs from ENV_FILE (or apps/api/.env) without overriding variables already
 * set, e.g. by the cPanel "Setup Node.js App" screen. Kept outside public_html on the server.
 */
export function loadEnvFile(): void {
  const file = process.env.ENV_FILE ?? resolve(__dirname, '..', '..', '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
