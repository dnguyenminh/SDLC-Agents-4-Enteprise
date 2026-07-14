/**
 * ConvertServerConfig — configuration for optional child convert MCP server (Task 10).
 * Graceful: if no config / spawn fails → NullOrchestrationGateway (no-tool behavior).
 */
import pino from 'pino';

const logger = pino({ name: 'convert-server-config' });

export interface ConvertServerOptions {
  command: string;
  args: string[];
  enabled: boolean;
}

/** Read convert server config from environment variables. */
export function loadConvertServerConfig(): ConvertServerOptions | null {
  const cmd = process.env.CONVERT_SERVER_CMD;
  if (!cmd) {
    logger.info('CONVERT_SERVER_CMD not set — using NullOrchestrationGateway (binary files → unconvertible)');
    return null;
  }
  const args = (process.env.CONVERT_SERVER_ARGS || '').split(' ').filter(Boolean);
  const enabled = process.env.CONVERT_SERVER_ENABLED !== 'false';
  if (!enabled) {
    logger.info('CONVERT_SERVER_ENABLED=false — convert server disabled');
    return null;
  }
  logger.info({ cmd, args }, 'Convert server config loaded');
  return { command: cmd, args, enabled };
}

/**
 * Validate convert server is reachable (health check).
 * Returns true if server responds, false otherwise.
 */
export async function checkConvertServerHealth(baseUrl?: string): Promise<boolean> {
  if (!baseUrl) { return false; }
  try {
    const resp = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    return resp.ok;
  } catch {
    logger.warn({ baseUrl }, 'Convert server health check failed — falling back to NullGateway');
    return false;
  }
}
