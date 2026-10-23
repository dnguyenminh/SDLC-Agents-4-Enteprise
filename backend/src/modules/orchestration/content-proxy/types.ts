/**
 * Content Proxy types — capability derived from a child tool's schema and the
 * adapted invocation passed from the extension wrapper.
 */

/** What a child tool can do with document content and file artifacts. */
export interface ContentCapability {
  /** Child argument that carries the document content (absent = content-less tool). */
  contentParam?: string;
  /** Child result contains `artifacts[]` with filesystem paths that can be inlined. */
  fileOutput: boolean;
  /** Argument names the child declares — adapter-only args outside this set are stripped. */
  declaredParams: ReadonlySet<string>;
}

/** Result of adapting one invocation (wrapper mode: content_base64 / output_path present). */
export interface AdaptedInvocation {
  args: Record<string, unknown>;
  wrapperMode: boolean;
  capability: ContentCapability;
  /** Set when wrapper mode was requested but the payload is unusable (returned as a tool error). */
  error?: string;
}
