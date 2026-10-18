/**
 * IndexingService — facade. Implementation lives in ./IndexingService/*.
 * Re-exports the exact public API of the original single-file module.
 */

export type { IndexOptions, ProgressReporter } from "./IndexingService/types";
export { IndexingService } from "./IndexingService/core";
