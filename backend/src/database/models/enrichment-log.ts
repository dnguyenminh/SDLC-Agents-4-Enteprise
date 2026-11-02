export interface EnrichmentLogRecord {
  id: number;
  ticketId: string;
  symbolName: string;
  filePath: string;
  modelUsed: string;
  budgetUsed: number;
  status: 'success' | 'error';
  createdAt: Date;
  updatedAt: Date;
}