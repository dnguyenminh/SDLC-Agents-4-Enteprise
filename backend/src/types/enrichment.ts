export interface ModelConfig {
  name: string;
  contextWindow: number;
  maxTokens?: number;
  provider: string;
}

export interface Budget {
  budget: number;
  windowSize: number;
}

export interface EnrichmentLog {
  ticketId: string;
  symbolName: string;
  filePath: string;
  modelUsed: string;
  budgetUsed: number;
  status: 'success' | 'error';
  createdAt: Date;
  updatedAt: Date;
}