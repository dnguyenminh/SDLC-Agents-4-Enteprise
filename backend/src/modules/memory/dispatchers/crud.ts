/**
 * crud.ts — mem_ingest, mem_ingest_file, mem_pin, mem_map, mem_crud handlers.
 * OCP fix: handleCrud() uses an action registry map instead of switch.
 * Facade (BR-18): implementations live in crud-shared.ts, crud-ingest.ts,
 * crud-ingest-file.ts, crud-pin.ts, crud-actions.ts.
 */
export { handleIngest } from './crud-ingest.js';
export { handleIngestFile, unconvertibleMessage } from './crud-ingest-file.js';
export type { IngestFileResponse } from './crud-ingest-file.js';
export { handlePin, handleMap } from './crud-pin.js';
export { handleCrud } from './crud-actions.js';
