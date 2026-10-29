import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Loads KEY=VALUE pairs from the first settings file found, without overriding variables already
 * set (e.g. by the cPanel "Setup Node.js App" screen):
 *   1. ENV_FILE
 *   2. apps/api/.env (development)
 *   3. ~/ai-sales-hq-data/hq.env (hosting: outside the app folder and public_html, survives deploys)
 * `apiDir` is the apps/api folder; entry points pass it because bundling changes __dirname depth.
 */
export function settingsFileCandidates(apiDir: string): string[] {
  return [process.env.ENV_FILE, join(apiDir, '.env'), join(homedir(), 'ai-sales-hq-data', 'hq.env')].filter(
    (f): f is string => !!f,
  );
}

export function loadEnvFile(apiDir: string = resolve(__dirname, '..', '..')): string | null {
  const file = settingsFileCandidates(apiDir).find((f) => existsSync(f)) ?? null;
  if (file) process.loadEnvFile(file);
  return file;
}
