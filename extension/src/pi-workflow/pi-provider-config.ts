import type { MutableModels } from '@earendil-works/pi-ai';

export interface PiProviderConfig {
  transportType: 'WebSocket' | 'HTTP';
  sessionId?: string;
  baseUrl?: string;
  allowStub?: boolean;
  /** DI: shared Models registry (tests inject the faux provider here). */
  models?: MutableModels;
}
