export interface SARIFLog {
  $schema: string;
  version: '2.1.0';
  runs: SARIFRun[];
}

export interface SARIFRun {
  tool: {
    driver: {
      name: string;
      version: string;
      rules: SARIFRule[];
    };
  };
  results: SARIFResult[];
}

export interface SARIFRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  fullDescription?: { text: string };
  defaultConfiguration: { level: 'error' | 'warning' | 'note' };
  properties: { tags: string[] };
}

export interface SARIFResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: SARIFLocation[];
  codeFlows?: SARIFCodeFlow[];
}

export interface SARIFLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: { startLine: number; endLine?: number; startColumn?: number };
  };
}

export interface SARIFCodeFlow {
  threadFlows: Array<{
    locations: Array<{
      location: SARIFLocation;
      message?: { text: string };
    }>;
  }>;
}
