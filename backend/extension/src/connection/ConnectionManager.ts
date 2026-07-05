/**
 * ConnectionManager — Backend connectivity state machine.
 * States: DISCONNECTED → CONNECTING → CONNECTED
 * Auto-reconnects with exponential backoff.
 */

import * as vscode from "vscode";
import { AuthManager } from "../auth/AuthManager";
import { HttpClient } from "../proxy/HttpClient";
import { HealthChecker } from "./HealthChecker";

export type ConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

export interface RemoteBackendConfig {
  url: string;
  healthCheckInterval: number;
  toolCallTimeout: number;
  chatTimeout: number;
}

export class ConnectionManager implements vscode.Disposable {
  private state: ConnectionState = "DISCONNECTED";
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelays = [1000, 2000, 4000, 8000, 16000];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthChecker: HealthChecker;

  private _onStateChange = new vscode.EventEmitter<ConnectionState>();
  readonly onStateChange: vscode.Event<ConnectionState> = this._onStateChange.event;

  constructor(
    private config: RemoteBackendConfig,
    private readonly authManager: AuthManager,
    private readonly httpClient: HttpClient
  ) {
    this.healthChecker = new HealthChecker(httpClient, config.healthCheckInterval);
    this.healthChecker.onHealthFail(() => {
      if (this.state === "CONNECTED") {
        this.transitionTo("DISCONNECTED");
        this.scheduleReconnect();
      }
    });
  }

  get currentState(): ConnectionState {
    return this.state;
  }

  get isConnected(): boolean {
    return this.state === "CONNECTED";
  }

  get backendUrl(): string {
    return this.config.url;
  }

  /**
   * Attempt to connect to backend.
   */
  async connect(): Promise<void> {
    this.transitionTo("CONNECTING");
    const healthy = await this.httpClient.healthCheck();
    if (healthy) {
      this.transitionTo("CONNECTED");
      this.reconnectAttempts = 0;
      this.healthChecker.start();
    } else {
      this.transitionTo("DISCONNECTED");
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect and stop health checking.
   */
  disconnect(): void {
    this.healthChecker.stop();
    this.cancelReconnect();
    this.transitionTo("DISCONNECTED");
  }

  /**
   * Update backend URL (e.g., settings changed).
   */
  updateConfig(newConfig: Partial<RemoteBackendConfig>): void {
    if (newConfig.url) {
      this.config.url = newConfig.url;
      this.httpClient.baseUrl = newConfig.url;
    }
    if (newConfig.healthCheckInterval) {
      this.config.healthCheckInterval = newConfig.healthCheckInterval;
      this.healthChecker.interval = newConfig.healthCheckInterval;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      vscode.window.showErrorMessage(
        "Cannot connect to Kiro backend. Check backend URL in settings."
      );
      return;
    }
    const delay = this.reconnectDelays[this.reconnectAttempts] || 16000;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }

  private transitionTo(newState: ConnectionState): void {
    if (this.state === newState) { return; }
    this.state = newState;
    this._onStateChange.fire(newState);
  }

  dispose(): void {
    this.healthChecker.stop();
    this.cancelReconnect();
    this._onStateChange.dispose();
  }
}
