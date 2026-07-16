/**
 * SA4E-42 — a tool row prepared for scoped upsert (embedding already generated).
 */
export interface PreparedTool {
  name: string;
  description: string;
  schemaJson: string;
  category: string;
  server: string;
  vector: Buffer;
}
