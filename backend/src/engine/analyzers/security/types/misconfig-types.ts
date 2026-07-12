import type { Severity } from './injection-types.js';

export interface MisconfigFinding {
  id: string;
  pattern: string;
  file: string;
  line: number;
  key: string;
  value: string;
  cwe: string;
  severity: Severity;
  remediation: string;
}

export interface SecretFinding {
  id: string;
  pattern: string;
  file: string;
  line: number;
  match: string;
  entropy: number;
  cwe: string;
  severity: Severity;
  masked: string;
}

export interface Dependency {
  name: string;
  version: string;
  scope: 'required' | 'dev' | 'optional';
  ecosystem: string;
  hashes: string[];
  license?: string;
}

export interface Vulnerability {
  id: string;
  summary: string;
  severity: Severity;
  affectedVersions: string;
  fixedVersion?: string;
  references: string[];
}

export interface SBOMComponent {
  type: 'library';
  name: string;
  version: string;
  purl: string;
  scope: string;
  hashes: Array<{ alg: string; content: string }>;
  licenses: string[];
}
