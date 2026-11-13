/** SA4E-393 Addendum 5 — public surface of the worktree-trust library. */
export { verifyWorktree } from './verifier.js';
export { WorktreeTrustService, type TrustServiceOptions } from './trust-service.js';
export { TrustCache } from './cache.js';
export { loadTrustConfig, parseAutotrustFlag, filterOpenFolders, type TrustConfig } from './config.js';
export { buildRejectionDetail, reasonGroup } from './messages.js';
export { nodeFs, readSmall, parseGitdirPointer, parseBacklink } from './git-files.js';
export { foldKey, samePath, isUncOrDevice, isInsideFolded } from './path-fold.js';
export { realResolve, symlinkEscapeCheck, type EscapeInfo } from './symlink-containment.js';
export type { TrustPort, TrustDeps, TrustLogger, WorktreeVerdict, WorktreeReason, FsLike } from './types.js';
