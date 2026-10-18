/**
 * Contracts for PowerShellTransport — response/request-option shapes and the
 * transport error type. Extracted from PowerShellTransport.ts (BR-18).
 */

/** Response from PowerShell transport */
export interface PwshResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

/** Options for PowerShell request */
export interface PwshRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  /** Path to persistent cookie jar file for session reuse across subprocess calls. */
  cookieJarPath?: string;
}

/** Error class for PowerShell transport */
export class PowerShellTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PowerShellTransportError";
  }
}
