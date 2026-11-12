/**
 * SA4E-393 — Report → tool payload mapping for design_gate_run.
 * Extracted from design-gate-tool.ts to meet ≤200 lines/file standard.
 */
import { redactPaths } from '../../slash/path-redactor';

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

/** Sanitize error text (C6: strip workspace root + any absolute path, no stack). */
export function sanitizeErrorText(err: unknown, workspaceRoot: string | undefined): string {
  const msg = err instanceof Error ? err.message : String(err);
  return `Design gate run failed: ${redactPaths(msg, workspaceRoot)}`;
}
type FetchStatus = 'success' | 'skipped' | 'failed';

/** Count findings per severity (unknown/missing severity counts as low). */
function countBySeverity(findings: any[]): SeverityBreakdown {
  const breakdown: SeverityBreakdown = { low: 0, medium: 0, high: 0 };
  for (const f of findings) {
    const sev = (f.severity ?? 'low').toLowerCase();
    if (Object.prototype.hasOwnProperty.call(breakdown, sev)) breakdown[sev as keyof SeverityBreakdown]++;
  }
  return breakdown;
}

/** One finding → tool payload entry (D1 schema). */
function toFindingPayload(f: any, idx: number, report: any, mode: string): FindingPayload {
  return {
    findingId: f.findingId ?? `f${idx + 1}`,
    runId: report.runId,
    mode: f.mode ?? mode,
    file: f.file,
    line: f.line,
    rule: f.rule,
    severity: f.severity,
    message: f.message,
  };
}

/** Leading report-level scalars (key order is part of the payload contract). */
function reportHead(report: any, mode: string) {
  return {
    ok: true as const,
    runId: report.runId,
    detectionMode: mode,
    score: report.score,
    pass: report.pass,
    threshold: report.threshold,
  };
}

/** Trailing report-level scalars. */
function reportTail(report: any) {
  return { fileCount: report.fileCount ?? 0, durationMs: report.durationMs ?? 0, message: report.message };
}

/** Assemble the full payload object. */
function buildPayload(report: any, mode: string, limit: number, fetchStatus?: FetchStatus): DesignGateRunPayload {
  const findings: any[] = report.findings ?? [];
  const payload: DesignGateRunPayload = {
    ...reportHead(report, mode),
    totalIssues: findings.length,
    severityBreakdown: countBySeverity(findings),
    findings: findings.slice(0, limit).map((f, idx) => toFindingPayload(f, idx, report, mode)),
    findingsReturned: Math.min(findings.length, limit),
    findingsTruncated: findings.length > limit,
    ...reportTail(report),
  };
  if (fetchStatus !== undefined) payload.fetchStatus = fetchStatus;
  return payload;
}
/** Map QualityReport + optional fetchStatus → tool payload per D1 schema. */
export function mapReportToPayload(report: any, mode: string, findingsLimit: number, fetchStatus?: FetchStatus): string {
  return JSON.stringify(buildPayload(report, mode, findingsLimit, fetchStatus), null, 2);
}
/** Tool success response shape. */
export function toolText(text: string): unknown {
  return { content: [{ type: 'text', text }], isError: false };
}

/** Tool error response shape (C6: sanitized, no stack, no internals). */
export function toolError(msg: string): unknown {
  return { content: [{ type: 'text', text: msg }], isError: true };
}