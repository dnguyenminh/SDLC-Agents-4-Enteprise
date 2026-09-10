/**
 * SA4E-??? — PegaCodeIntelClient
 * Thin HTTP client for the custom Pega "CodeIntelligence" data-page API used to
 * enumerate application artifacts (access groups, service packages, methods).
 * Tolerant to Pega's response envelope (pxResults vs raw array).
 */

export interface DataPageRow {
  pzInsKey?: string;
  pyInsKey?: string;
  [key: string]: unknown;
}

/** Extract the pzInsKey (download key) from a data-page row. */
export function rowInsKey(row: DataPageRow): string | undefined {
  return (row.pzInsKey || row.pyInsKey || (row as Record<string, unknown>).pxInsKey) as string | undefined;
}

/**
 * Derive the Pega PRWeb base URL from a CodeIntelligence base URL.
 * e.g. https://host/prweb/api/CodeIntelligence/v1 -> https://host/prweb
 */
export function derivePegaEndpoint(codeIntelBase: string): string {
  return codeIntelBase.replace(/\/api\/CodeIntelligence\/.*$/i, '').replace(/\/$/, '');
}

export class PegaCodeIntelClient {
  private readonly base: string;

  constructor(
    codeIntelBase: string,
    private readonly authHeader?: string,
  ) {
    this.base = codeIntelBase.replace(/\/$/, '');
  }

  /**
   * POST a data page and return its rows.
   * @param dataPageName - e.g. D_pzAccessGroupsByApplication
   * @param body - request payload (AppName/AppVersion + extra filters)
   */
  async listDataPage(
    dataPageName: string,
    body: Record<string, unknown>,
  ): Promise<DataPageRow[]> {
    const url = `${this.base}/datapage/list?dataPageName=${encodeURIComponent(dataPageName)}`;
    const headers: Record<string, string> = {
      'Content-Type': 'text/plain',
      Accept: 'application/json',
    };
    if (this.authHeader) headers['Authorization'] = this.authHeader;

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`CodeIntel datapage ${dataPageName} failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    return normalizeRows(json);
  }

  /**
   * Download a full rule JSON by its pzInsKey (URL-encoded).
   * @param insKey - Pega instance key (e.g. "RULE-SERVICE-REST CODEINTELLIGENCE V1!X #ts")
   */
  async getRule(insKey: string): Promise<Record<string, unknown> | null> {
    const url = `${this.base}/rules/${encodeURIComponent(insKey)}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.authHeader) headers['Authorization'] = this.authHeader;

    const res = await fetch(url, { method: 'GET', headers });
    if (!res.ok) {
      throw new Error(`CodeIntel getRule failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    if (!json || !json.pxObjClass) return null;
    return json;
  }
}

/** Normalize a Pega data page response into a flat row array. */
export function normalizeRows(json: Record<string, unknown>): DataPageRow[] {
  const results = json.pxResults;
  if (Array.isArray(results)) return results as DataPageRow[];
  if (Array.isArray(json)) return json as DataPageRow[];
  if (json && typeof json === 'object') return [json as DataPageRow];
  return [];
}
