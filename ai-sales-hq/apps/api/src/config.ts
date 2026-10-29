import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    HOST: z.string().default('127.0.0.1'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().regex(/^mysql:\/\//, 'DATABASE_URL must start with mysql://'),
    // Public origin of the app, e.g. https://agent.unutilmastam.uz. Used for CSRF origin checks.
    APP_ORIGIN: z.url(),
    // Secret for encrypting TOTP seeds at rest. At least 32 characters.
    APP_SECRET_KEY: z.string().min(32, 'APP_SECRET_KEY must be at least 32 characters'),
    // One-time token that allows creating the first owner account from the browser.
    SETUP_TOKEN: z.string().min(24).optional(),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(1440).default(120),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    LOGIN_MAX_FAILURES: z.coerce.number().int().min(3).max(50).default(5),
    LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
    // Passenger sits behind Apache; trust its X-Forwarded-* headers.
    TRUST_PROXY: bool.default(true),
    // In production every owner must enrol TOTP before using the app (SPEC_AMENDMENTS A11).
    TOTP_REQUIRED: bool.optional(),
    // Google service account JSON (role: Cloud Datastore Viewer) for the read-only catalog sync.
    // Kept outside public_html with permissions 600. Absent = integration NOT_CONFIGURED.
    FIREBASE_SERVICE_ACCOUNT_FILE: z.string().min(1).optional(),
    // Separate owner-only bot (A5); never the customer bot's token.
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d{6,12}:[A-Za-z0-9_-]{30,}$/, 'TELEGRAM_BOT_TOKEN has the wrong format')
      .optional(),
    // Comma-separated numeric chat ids allowed to use the bot.
    TELEGRAM_OWNER_CHAT_IDS: z
      .string()
      .regex(/^-?\d+(,\s*-?\d+)*$/, 'TELEGRAM_OWNER_CHAT_IDS must be numeric ids separated by commas')
      .optional(),
    // Google Places API (New) key, server-side only; restrict it to the Places API in Google Cloud.
    GOOGLE_PLACES_API_KEY: z
      .string()
      .regex(/^[A-Za-z0-9_-]{20,100}$/, 'GOOGLE_PLACES_API_KEY has the wrong format')
      .optional(),
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .regex(/^[A-Za-z0-9_-]{24,256}$/)
      .optional(),
  })
  .transform((c) => ({ ...c, TOTP_REQUIRED: c.TOTP_REQUIRED ?? c.NODE_ENV === 'production' }))
  .superRefine((c, ctx) => {
    if (c.NODE_ENV !== 'production') return;
    if (!c.APP_ORIGIN.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'must be https:// in production' });
    }
    if (/change|example|secret|xxxx/i.test(c.APP_SECRET_KEY)) {
      ctx.addIssue({ code: 'custom', path: ['APP_SECRET_KEY'], message: 'looks like a placeholder' });
    }
  });

export type Config = z.output<typeof schema>;

export class ConfigError extends Error {}

/** Parses the environment. The error lists variable names only, never values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid configuration:\n  ${lines.join('\n  ')}`);
  }
  return parsed.data;
}

export const BUSINESS_TIMEZONE = 'Asia/Tashkent';
