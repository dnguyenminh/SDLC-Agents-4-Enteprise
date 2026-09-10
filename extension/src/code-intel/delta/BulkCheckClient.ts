/**
 * SA4E-241 — BulkCheckClient. Calls POST /api/v1/pega/rulecatalog/bulk-check to
 * obtain the set of checksums the backend already has (NT-4). Batches ≤1000 per
 * request (§4.3) and validates every response with zod safeParse (code-standards).
 *
 * DIP: depends on the `HttpPoster` abstraction, not a concrete HTTP client, so it
 * is trivially testable and transport-agnostic.
 */
import { BulkCheckResponseSchema } from "./models/BulkCheckSchema";

/** Batch size ceiling per bulk-check request (client-side chunking). */
const BATCH_SIZE = 1000;

/** Error surfaced when the bulk-check response fails schema validation. */
export class BulkCheckError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "BulkCheckError";
  }
}

/**
 * HttpPoster — minimal POST abstraction (DIP). Implementations perform the actual
 * transport (fetch / proxy) and return the parsed JSON body.
 */
export interface HttpPoster {
  /**
   * POST a JSON body and return the parsed JSON response.
   * @param path - Endpoint path (relative to the client's base URL)
   * @param body - JSON-serializable request body
   * @param headers - Extra headers (e.g. X-Project-Id, Authorization)
   */
  postJson(path: string, body: unknown, headers: Record<string, string>): Promise<unknown>;
}

/** Client for the checksum bulk-check contract. */
export class BulkCheckClient {
  constructor(private readonly http: HttpPoster) {}

  /**
   * Return the subset of `checksums` the backend already has for `projectId`.
   * @param projectId - Authenticated project identity (sent via X-Project-Id header)
   * @param checksums - All candidate checksums to test
   * @returns Set of existing checksums (union across batches)
   * @throws BulkCheckError if any batch response fails schema validation
   */
  async fetchExisting(projectId: string, checksums: string[]): Promise<Set<string>> {
    const out = new Set<string>();
    for (const batch of chunk(checksums, BATCH_SIZE)) {
      const raw = await this.http.postJson(
        "/api/v1/pega/rulecatalog/bulk-check",
        { projectId, checksums: batch },
        { "X-Project-Id": projectId },
      );
      const parsed = BulkCheckResponseSchema.safeParse(raw);
      if (!parsed.success) {
        throw new BulkCheckError("BULK_CHECK_BAD_RESPONSE", parsed.error.message);
      }
      for (const c of parsed.data.data.existing) { out.add(c); }
    }
    return out;
  }
}

/** Split an array into fixed-size chunks (last chunk may be smaller). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) { out.push(arr.slice(i, i + size)); }
  return out;
}
