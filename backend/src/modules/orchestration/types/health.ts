/**
 * Health Check & Auto-Reconnect — Shared types, interfaces, and defaults.
 * SA4E-37
 */

export type ConnectionState =
  | 'connected'
  | 'unhealthy'
  | 'reconnecting'
  | 'failed'
  | 'disconnected';

export interface HealthCheckConfig {
  /** Ping interval in milliseconds (default: 30000) */
  interval: number;
  /** Ping timeout in milliseconds (default: 5000) */
  pingTimeout: number;
  /** Consecutive failures before marking unhealthy (default: 2) */
  failureThreshold: number;
  /** Initial reconnect delay in milliseconds (default: 1000) */
  initialDelay: number;
  /** Backoff multiplier per attempt (default: 2) */
  backoffMultiplier: number;
  /** Maximum backoff delay cap in milliseconds (default: 30000) */
  maxDelay: number;
  /** Maximum reconnect attempts before marking failed (default: 10) */
  maxRetries: number;
  /** Enable jitter on backoff delays (default: true) */
  jitterEnabled: boolean;
  /** Jitter range as decimal (default: 0.2 = ±20%) */
  jitterRange: number;
}

export interface ServerStateChangeEvent {
  serverName: string;
  previousState: ConnectionState;
  newState: ConnectionState;
  timestamp: string;
  error?: string;
  reconnectDuration?: number;
}

export interface ServerStatusEntry {
  name: string;
  state: ConnectionState;
  connected: boolean;
  toolCount: number;
  lastHealthCheck: string | null;
  consecutiveFailures: number;
  reconnectAttempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
}

export type ServerStateChangeCallback = (event: ServerStateChangeEvent) => void;
export type Unsubscribe = () => void;

export interface ServerConnectionState {
  name: string;
  state: ConnectionState;
  lastHealthCheck: string | null;
  consecutiveFailures: number;
  reconnectAttempts: number;
  lastError: string | null;
  reconnectTimerId: ReturnType<typeof setTimeout> | null;
  failureStartedAt: string | null;
  nextRetryAt: string | null;
}

export const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  interval: 30_000,
  pingTimeout: 5_000,
  failureThreshold: 2,
  initialDelay: 1_000,
  backoffMultiplier: 2,
  maxDelay: 30_000,
  maxRetries: 10,
  jitterEnabled: true,
  jitterRange: 0.2,
};

/** Production-tuned config: longer timeouts for stdio servers, less aggressive failure detection */
export const PRODUCTION_HEALTH_CONFIG: HealthCheckConfig = {
  interval: 60_000,
  pingTimeout: 15_000,
  failureThreshold: 3,
  initialDelay: 2_000,
  backoffMultiplier: 2,
  maxDelay: 60_000,
  maxRetries: 10,
  jitterEnabled: true,
  jitterRange: 0.2,
};

/** Valid state transitions map */
export const VALID_TRANSITIONS: Record<ConnectionState, ConnectionState[]> = {
  disconnected: ['connected'],
  connected: ['unhealthy', 'disconnected'],
  unhealthy: ['reconnecting'],
  reconnecting: ['connected', 'reconnecting', 'failed', 'disconnected'],
  failed: ['reconnecting', 'disconnected'],
};
