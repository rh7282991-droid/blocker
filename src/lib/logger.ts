/**
 * Development-mode logger for FocusOS.
 * All messages are prefixed with [FocusOS] and a timestamp.
 * Only outputs in development mode, except error() which always logs.
 */

const PREFIX = '[FocusOS]';

function getTimestamp(): string {
  return new Date().toISOString();
}

function isDev(): boolean {
  try {
    // Vite provides import.meta.env.DEV
    return import.meta.env.DEV;
  } catch {
    // Fallback for environments where import.meta.env is not available
    return false;
  }
}

export const logger = {
  debug(...args: unknown[]): void {
    if (isDev()) {
      console.debug(PREFIX, getTimestamp(), ...args);
    }
  },

  info(...args: unknown[]): void {
    if (isDev()) {
      console.info(PREFIX, getTimestamp(), ...args);
    }
  },

  warn(...args: unknown[]): void {
    if (isDev()) {
      console.warn(PREFIX, getTimestamp(), ...args);
    }
  },

  error(...args: unknown[]): void {
    // Always log errors, even in production
    console.error(PREFIX, getTimestamp(), ...args);
  },

  group(label: string): void {
    if (isDev()) {
      console.group(`${PREFIX} ${label}`);
    }
  },

  groupEnd(): void {
    if (isDev()) {
      console.groupEnd();
    }
  },
};
