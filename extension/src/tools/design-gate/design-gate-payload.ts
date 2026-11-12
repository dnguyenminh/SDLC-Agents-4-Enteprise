/**
 * SA4E-393 — Report → tool payload mapping for design_gate_run.
 * Extracted from design-gate-tool.ts to meet ≤200 lines/file standard.
 */

export interface SeverityBreakdown {
  low: number;
  medium: number;
  high: number;
}

export interface FindingPayload {
  findingId: string;
  runId: string;
  mode: string;
  file: string;
  line: number | undefined;
  rule: string;
  severity: string;
  message: string;
}

export interface DesignGateRunPayload {
  ok: true;
  runId: string;
  detectionMode: string;
  score: number;
  pass: boolean;
  threshold: number;
  totalIssues: number;
  severityBreakdown: SeverityBreakdown;
  findings: FindingPayload[];
  findingsReturned: number;
  findingsTruncated: boolean;
  fileCount: number;
  durationMs: number;
  message?: string;
  fetchStatus?: 'success' | 'skipped' | 'failed';
}

/** Sanitize error text (C6: strip workspace-root prefix, no stack). */
export function sanitizeErrorText(err: unknown, workspaceRoot: string | undefined): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (!workspaceRoot) return `Design gate run failed: ${msg}`;
  // SEC-F03: escape regex specials, match both separators, case-insensitive on win32
  const pattern = workspaceRoot
    .split(/[\\/]+/)
    .map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\\\/]+');
  const flags = process.platform === 'win32' ? 'gi' : 'g';
  return `Design gate run failed: ${msg.replace(new RegExp(pattern, flags), '<workspace>')}`;
}

/** Map QualityReport + optional fetchStatus → tool payload per D1 schema. */
export function mapReportToPayload(
  report: any,
  mode: string,
  findingsLimit: number,
  fetchStatus?: 'success' | 'skipped' | 'failed',
): string {
  const findings = report.findings ?? [];
  const totalIssues = findings.length;
  const severityBreakdown: SeverityBreakdown = { low: 0, medium: 0, high: 0 };
  for (const f of findings) {
    const sev = (f.severity ?? 'low').toLowerCase();
    if (severityBreakdown.hasOwnProperty(sev)) severityBreakdown[sev as keyof SeverityBreakdown]++;
  }

  const payload: DesignGateRunPayload = {
    ok: true,
    runId: report.runId,
    detectionMode: mode,
    score: report.score,
    pass: report.pass,
    threshold: report.threshold,
    totalIssues,
    severityBreakdown,
    findings: findings.slice(0, findingsLimit).map((f: any, idx: number) => ({
      findingId: f.findingId ?? `f${idx + 1}`,
      runId: report.runId,
      mode: f.mode ?? mode,
      file: f.file,
      line: f.line,
      rule: f.rule,
      severity: f.severity,
      message: f.message,
    })),
    findingsReturned: Math.min(findings.length, findingsLimit),
    findingsTruncated: findings.length > findingsLimit,
    fileCount: report.fileCount ?? 0,
    durationMs: report.durationMs ?? 0,
    message: report.message,
  };
  if (fetchStatus !== undefined) {
    payload.fetchStatus = fetchStatus;
  }
  return JSON.stringify(payload, null, 2);
}

/** Tool success response shape. */
export function toolText(text: string): unknown {
  return { content: [{ type: 'text', text }], isError: false };
}

/** Tool error response shape (C6: sanitized, no stack, no internals). */
export function toolError(msg: string): unknown {
  return { content: [{ type: 'text', text: msg }], isError: true };
}