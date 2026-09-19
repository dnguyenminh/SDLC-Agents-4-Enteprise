export interface PiProviderConfig {
  transportType: 'WebSocket' | 'HTTP';
  sessionId?: string;
  baseUrl?: string;
  allowStub?: boolean;
}
