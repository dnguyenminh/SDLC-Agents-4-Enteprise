/** SA4E-393 Addendum 5 — public surface of the worktree-trust library. */
export { verifyWorktree } from './verifier';
export { WorktreeTrustService, type TrustServiceOptions } from './trust-service';
export { TrustCache } from './cache';
export { loadTrustConfig, parseAutotrustFlag, filterOpenFolders, type TrustConfig } from './config';
export { buildRejectionDetail, reasonGroup } from './messages';
export { nodeFs, readSmall, parseGitdirPointer, parseBacklink } from './git-files';
export { foldKey, samePath, isUncOrDevice, isInsideFolded } from './path-fold';
export { realResolve, symlinkEscapeCheck, type EscapeInfo } from './symlink-containment';
export type { TrustPort, TrustDeps, TrustLogger, WorktreeVerdict, WorktreeReason, FsLike } from './types';
