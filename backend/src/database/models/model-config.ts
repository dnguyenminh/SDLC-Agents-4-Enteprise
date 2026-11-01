export interface ModelConfigRecord {
  id: number;
  modelName: string;
  contextWindow: number;
  maxTokens?: number;
  provider: string;
  createdAt: Date;
}