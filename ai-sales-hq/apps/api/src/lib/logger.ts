import pino, { type LoggerOptions } from 'pino';

// Never log credentials or session material (MASTER_SPEC §15, §20).
export const REDACT_PATHS = [
  'password',
  '*.password',
  'newPassword',
  '*.newPassword',
  'code',
  '*.code',
  'token',
  '*.token',
  'setupToken',
  '*.setupToken',
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
];

const SECRET_PATTERNS: [RegExp, string][] = [
  [/bot\d{6,12}:[A-Za-z0-9_-]{30,}/g, 'bot[REDACTED]'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, 'sk-[REDACTED]'],
  [/(mysql:\/\/[^:\s]+:)[^@\s]+@/g, '$1[REDACTED]@'],
];

/** Masks secrets that may appear inside free-text log messages. */
export function redactText(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep), text);
}

export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    hooks: {
      logMethod(args, method) {
        const mapped = args.map((a) => (typeof a === 'string' ? redactText(a) : a)) as typeof args;
        method.apply(this, mapped);
      },
    },
  };
}

export function createLogger(level: string) {
  return pino(loggerOptions(level));
}
