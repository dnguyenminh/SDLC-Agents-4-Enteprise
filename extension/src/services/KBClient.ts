/**
 * KBClient — REST API client for Knowledge Base backend.
 * SA4E-30: Replaces MCP tool calls with direct REST API calls.
 * Uses IAuthManager (DIP) for JWT token management.
 */

import type { IAuthManager } from '../types/server-types';

export interface SearchParams {
  query: string;
  limit?: number;
  scope?: 'USER' | 'WORKSPACE' | 'PROJECT' | 'SHARED';
  type?: string;
  detail?: boolean;
}

export interface IngestParams {
  content: string;
  summary?: string;
  type: string;
  scope: 'USER' | 'WORKSPACE' | 'PROJECT' | 'SHARED';
  source?: string;
  tags?: string;
}

export interface IngestFileParams {
  file_path: string;
  type?: string;
  scope?: string;
  format?: string;
}

export interface KBResponse<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}

export class KBClientError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
    this.name = 'KBClientError';
  }
}

export class KBClient {
  constructor(
    private baseUrl: string,
    private authManager: IAuthManager,
  ) {}

  async search(params: SearchParams): Promise<any> {
    return this.post('/api/v1/memory/search', params);
  }

  async ingest(params: IngestParams): Promise<any> {
    return this.post('/api/v1/memory/ingest', params);
  }

  async ingestFile(params: IngestFileParams): Promise<any> {
    return this.post('/api/v1/memory/ingest-file', params);
  }

  async codeSearch(query: string, limit?: number): Promise<any> {
    return this.post('/api/v1/code/search', { query, limit });
  }

  async curatedContext(query: string, maxTokens?: number): Promise<any> {
    return this.post('/api/v1/context/curated', { query, max_tokens: maxTokens });
  }

  async status(): Promise<any> {
    return this.get('/api/v1/admin/status');
  }

  async migrateScope(mapping: Record<string, string>, dryRun = false): Promise<any> {
    return this.post('/api/v1/admin/migrate-scope', { mapping, dry_run: dryRun });
  }

  private async post<T>(path: string, body: any): Promise<T> {
    const token = await this.authManager.getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) { headers['Authorization'] = `Bearer ${token}`; }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const json = await response.json() as KBResponse<T>;
    if (json.error) {
      throw new KBClientError(json.error.code, json.error.message, response.status);
    }
    return json.data as T;
  }

  private async get<T>(path: string): Promise<T> {
    const token = await this.authManager.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) { headers['Authorization'] = `Bearer ${token}`; }

    const response = await fetch(`${this.baseUrl}${path}`, { method: 'GET', headers });
    const json = await response.json() as KBResponse<T>;
    if (json.error) {
      throw new KBClientError(json.error.code, json.error.message, response.status);
    }
    return json.data as T;
  }
}
