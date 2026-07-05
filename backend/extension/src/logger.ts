/**
 * Minimal structured logger interface.
 * In production, replace with pino or winston.
 */
export interface Logger {
  trace(msg: string, data?: Record<string, unknown>): void;
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * Default console-based logger with JSON structured output.
 */
export const logger: Logger = {
  trace(msg: string, data?: Record<string, unknown>) {
    if (process.env.LOG_LEVEL === 'trace') {
      console.log(JSON.stringify({ level: 'trace', msg, ...data, timestamp: new Date().toISOString() }));
    }
  },
  debug(msg: string, data?: Record<string, unknown>) {
    console.debug(JSON.stringify({ level: 'debug', msg, ...data, timestamp: new Date().toISOString() }));
  },
  info(msg: string, data?: Record<string, unknown>) {
    console.info(JSON.stringify({ level: 'info', msg, ...data, timestamp: new Date().toISOString() }));
  },
  warn(msg: string, data?: Record<string, unknown>) {
    console.warn(JSON.stringify({ level: 'warn', msg, ...data, timestamp: new Date().toISOString() }));
  },
  error(msg: string, data?: Record<string, unknown>) {
    console.error(JSON.stringify({ level: 'error', msg, ...data, timestamp: new Date().toISOString() }));
  },
};
