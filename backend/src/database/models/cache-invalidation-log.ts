export interface CacheInvalidationLogRecord {
  id: number;
  modelName: string;
  invalidatedAt: Date;
}