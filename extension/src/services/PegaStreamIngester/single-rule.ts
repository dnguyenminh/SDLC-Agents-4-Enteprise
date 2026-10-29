/**
 * single-rule.ts — per-rule ingest (POST /api/v1/pega/ingest-rule).
 *
 * Extracted from PegaStreamIngester (BR-18 ≤200-LOC) as free functions over a
 * context, mirroring stream-job.ts. Owns: endpoint validation, explicit fetch
 * timeout, defensive body read (socket-closed-mid-body → retryable), the
 * 401/not-registered/classified-error envelope handling, and the retry wrapper.
 */

import type { IngestAuthProvider } from "../../utils/backend-auth-headers";
import { describeFetchError } from "../../utils/http-client-utils";
import type {
  IngestSingleRuleResponse,
  IngestSingleRuleResult,
  LogFn,
} from "./ingest-types";
import { IngestAuthError, IngestRejectedError, TransientBodyError } from "./ingest-auth";
import { withIngestRetry, type RetryConfig } from "./ingest-retry";

/** Per-rule ingest request timeout (ms) — a hung backend becomes a retryable TimeoutError. */
const INGEST_REQUEST_TIMEOUT_MS = 30_000;

/** Collaborators the single-rule flow needs from the owning ingester. */
export interface SingleRuleContext {
  backendUrl: string;
  auth?: IngestAuthProvider;
  log?: LogFn;
  retryConfig: RetryConfig;
  registeredProjects: Set<string>;
  /** Wrap a send() in refresh-on-401. */
  fetchWithAuthRetry: (
    send: (token: string | undefined) => Promise<Response>,
    endpoint?: string,
  ) => Promise<Response>;
  authHeaders: (projectId: string, extra?: Record<string, string>) => Record<string, string>;
  /** Sanitize + cap envelope text (CR/LF strip, 200-char cap). */
  truncate: (value: string) => string;
  /** Pre-register the project (SA4E-375 fallback) before a retry. */
  ensureProjectRegistered: (projectId: string, appName?: string) => Promise<void>;
}

export interface SingleRuleArgs {
  projectId: string;
  ruleJson: Record<string, unknown>;
  checksum?: string;
  version?: string;
  appName?: string;
}

/** Ingest ONE rule with transient-fault retry (Fix 5). */
export async function ingestSingleRuleCore(
  ctx: SingleRuleContext,
  args: SingleRuleArgs,
): Promise<IngestSingleRuleResult> {
  const describe = ruleDescriptor(args.ruleJson);
  return withIngestRetry(() => attemptOnce(ctx, args), ctx.retryConfig, ctx.log, describe);
}

/** One attempt: POST + envelope handling (wrapped by retry). */
async function attemptOnce(
  ctx: SingleRuleContext,
  args: SingleRuleArgs,
): Promise<IngestSingleRuleResult> {
  const { projectId, ruleJson, checksum, version, appName } = args;
  const endpoint = resolveIngestEndpoint(ctx.backendUrl);
  const body = JSON.stringify({ projectId, ruleJson, checksum, version, appName });

  const res = await ctx.fetchWithAuthRetry(async (token) => {
    const headers = ctx.authHeaders(projectId, { "Content-Type": "application/json" });
    if (token) { headers["Authorization"] = `Bearer ${token}`; }
    return fetch(endpoint, {
      method: "POST",
      headers,
      body,
      // Hung backend → TimeoutError (retryable) instead of blocking forever.
      signal: AbortSignal.timeout(INGEST_REQUEST_TIMEOUT_MS),
    });
  }, "rule");

  const json = await readEnvelope(res);
  if (json.error) {
    return handleEnvelopeError(ctx, args, res, json);
  }
  if (!json.data) {
    throw new Error("Ingest returned empty data");
  }
  return json.data;
}

/** Map a backend error envelope to the right typed throw / fallback retry. */
async function handleEnvelopeError(
  ctx: SingleRuleContext,
  args: SingleRuleArgs,
  res: Response,
  json: IngestSingleRuleResponse,
): Promise<IngestSingleRuleResult> {
  const err = json.error!;
  const { projectId, appName } = args;
  // 401 persists → typed auth error (message contract preserved).
  if (res.status === 401) {
    throw new IngestAuthError(`Ingest failed: ${ctx.truncate(err.message)}`, res.status);
  }
  // SA4E-375: auto-register the project and retry once on PROJECT_NOT_REGISTERED.
  if (err.message.includes("not registered") && !ctx.registeredProjects.has(projectId)) {
    ctx.registeredProjects.add(projectId);
    await ctx.ensureProjectRegistered(projectId, appName);
    return ingestSingleRuleCore(ctx, args);
  }
  // Classified backend failure — preserve code/category/retryable for the caller.
  const d = err.details;
  throw new IngestRejectedError(
    `Ingest failed: ${ctx.truncate(err.message)}`,
    err.code ?? "INTERNAL_ERROR",
    d?.category ?? "unknown",
    d?.retryable ?? false,
    d?.errorName ?? "Error",
    res.status,
  );
}

/**
 * Build + validate the ingest endpoint. Throws a clear, non-retryable config
 * error when backendUrl is empty/malformed, instead of an opaque fetch() parse
 * failure that mimics a backend outage.
 */
export function resolveIngestEndpoint(backendUrl: string): string {
  const base = (backendUrl ?? "").trim().replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "Ingest failed: backend URL is empty — set `sdlcAgents.backend.url` to the Code Intelligence server (e.g. http://127.0.0.1:48721).",
    );
  }
  const endpoint = `${base}/api/v1/pega/ingest-rule`;
  if (!URL.parse(endpoint)) {
    throw new Error(
      `Ingest failed: backend URL "${base}" is not a valid absolute URL — check \`sdlcAgents.backend.url\`.`,
    );
  }
  return endpoint;
}

/**
 * Read the response body into the envelope. A socket closed MID-BODY makes
 * fetch() resolve on headers, then throw while reading — a TRANSIENT fault to
 * retry, not a permanent parse error. Empty/truncated/non-JSON bodies are
 * re-tagged transient too.
 */
async function readEnvelope(res: Response): Promise<IngestSingleRuleResponse> {
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw new TransientBodyError(`Ingest response body read failed: ${describeFetchError(err)}`, err);
  }
  try {
    return JSON.parse(text) as IngestSingleRuleResponse;
  } catch {
    throw new TransientBodyError(
      `Ingest response was not valid JSON (status=${res.status}, ${text.length} bytes) — likely a truncated/closed response`,
    );
  }
}

/** One-line rule identity for retry logs (insKey/class/name). */
function ruleDescriptor(ruleJson: Record<string, unknown>): string {
  const insKey = String(ruleJson.pzInsKey ?? ruleJson.insKey ?? "");
  const cls = String(ruleJson.pxObjClass ?? "");
  const name = String(ruleJson.pyRuleName ?? "");
  return `insKey=${insKey} pxObjClass=${cls} pyRuleName=${name}`;
}
