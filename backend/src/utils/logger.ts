/**
 * Simple development-friendly logger.
 * Wraps console methods with timestamps and log levels.
 * Can be replaced with a structured logger (e.g., pino) later if needed.
 */
export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(formatLog('INFO', message, meta));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(formatLog('WARN', message, meta));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(formatLog('ERROR', message, meta));
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLog('DEBUG', message, meta));
    }
  },
};

function formatLog(
  level: string,
  message: string,
  meta?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}
