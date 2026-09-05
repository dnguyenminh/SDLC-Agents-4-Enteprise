/**
 * SA4E-6 — Test harness helper: a Pino-compatible mock logger.
 * The sandbox classes call logger.child / .info / .debug etc.; the previous
 * `{} as any` stub lacked those methods and crashed the unit tests.
 */
export function createMockLogger(): any {
  const noop = () => undefined;
  const child = () => createMockLogger();
  return {
    info: noop,
    debug: noop,
    warn: noop,
    error: noop,
    trace: noop,
    fatal: noop,
    silent: noop,
    child,
    level: 'silent',
  };
}
