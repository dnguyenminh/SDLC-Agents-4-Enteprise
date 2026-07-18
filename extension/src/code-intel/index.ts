/**
 * Code Intelligence module — barrel exports.
 * Provides workspace scanning, incremental indexing, and upload to backend.
 */

export { CodeIntelScanner } from "./CodeIntelScanner";
export { CodeIntelUploader } from "./CodeIntelUploader";
export { FileChangeWatcher } from "./FileChangeWatcher";
export { TimestampResolver } from "./TimestampResolver";
export { HashCache } from "./HashCache";
export { OfflineQueue } from "./OfflineQueue";
export * from "./models";
