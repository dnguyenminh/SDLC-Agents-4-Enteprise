import type { TaintPath } from './taint-types.js';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
export type Confidence = 'High' | 'Medium' | 'Low';

export interface InjectionPattern {
  id: number;
  name: string;
  category: string;
  cwe: string;
  severity: Severity;
  sinkPatterns: string[];
  dangerousOps: string[];
  safePatterns: string[];
  description: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  category: string;
  pattern: InjectionPattern;
  taintPath: TaintPath;
  severity: Severity;
  confidence: Confidence;
  cwe: string;
  message: string;
  remediation: string;
  location: {
    file: string;
    startLine: number;
    endLine: number;
  };
  suppressed: boolean;
  suppressionInfo?: SuppressionInfo;
}

export interface SuppressionInfo {
  marker: string;
  scope: 'line' | 'block' | 'file';
  line: number;
}

export interface ScanOptions {
  filePath?: string;
  includeSuppressed?: boolean;
  severityThreshold?: Severity;
  categories?: string[];
  outputFormat?: 'json' | 'sarif';
}

export interface ScanResult {
  findings: Finding[];
  suppressed: Finding[];
  summary: {
    total: number;
    bySeverity: Record<Severity, number>;
    byCategory: Record<string, number>;
    filesScanned: number;
    scanDuration: number;
  };
}
