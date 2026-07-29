/**
 * Safe logging utility that filters sensitive data in production
 * and only logs in development mode.
 */

const isDevelopment = import.meta.env.DEV;

// Patterns to redact from logs
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /password/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
];

// Keys that should be redacted
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'api_key',
  'apiKey',
  'platformApiKey',
  'platform_api_key',
  'access_token',
  'refresh_token',
  'secret',
  'authorization',
  'token',
  'private_key',
  'privateKey',
]);

function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_KEYS.has(key.toLowerCase())) return true;
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) {
    return '[REDACTED]';
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // Check if the string looks like an API key or token
    if (value.length > 20 && /^[a-zA-Z0-9_-]+$/.test(value)) {
      return '[REDACTED]';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item));
  }

  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      sanitized[k] = sanitizeValue(v, k);
    }
    return sanitized;
  }

  return value;
}

function formatArgs(args: unknown[]): unknown[] {
  return args.map(arg => sanitizeValue(arg));
}

export const logger = {
  /**
   * Debug log - only in development
   */
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...formatArgs(args));
    }
  },

  /**
   * Info log - only in development
   */
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.log('[INFO]', ...formatArgs(args));
    }
  },

  /**
   * Warning log - sanitized, shown in both dev and prod
   */
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...formatArgs(args));
  },

  /**
   * Error log - sanitized, shown in both dev and prod
   * For production, errors should go to Sentry instead
   */
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...formatArgs(args));
  },
};

export default logger;
