/**
 * SA4E-42 — a tool row prepared for scoped upsert (embedding already generated).
 */
export interface PreparedTool {
  name: string;
  description: string;
  schemaJson: string;
  category: string;
  server: string;
  /** SA4E-369 follow-up: derived keyword surface (see orchestration/tool-labels). */
  labels?: string;
  vector: Buffer;
}
