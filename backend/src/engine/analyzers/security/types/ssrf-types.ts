import type { TaintSource, TaintSink, TaintPath } from './taint-types.js';
import type { Severity } from './injection-types.js';

export type TrustTier = 'T1' | 'T2' | 'T3';

export interface SSRFFinding {
  handler: string;
  filePath: string;
  source: TaintSource;
  sink: TaintSink;
  path: number[];
  trustTier: TrustTier;
  confidence: number;
  missingControl: string;
  cwe: string;
  severity: Severity;
}

export interface IDORFinding {
  handler: string;
  filePath: string;
  idParam: string;
  dbLookup: { function: string; line: number };
  missingAuthzCheck: boolean;
  trustTier: TrustTier;
  confidence: number;
  cwe: string;
  severity: Severity;
}

export interface MissingAuthFinding {
  handler: string;
  filePath: string;
  route: string;
  httpMethod: string;
  controller: string;
  siblingAuthRatio: number;
  confidence: number;
  cwe: string;
  severity: Severity;
}
