/**
 * Invocation adapter — maps the wrapper's `content_base64` onto the child's own
 * content argument (e.g. `markdown`) and strips adapter-only arguments.
 *
 * Wrapper mode is signalled by the presence of `content_base64` or `output_path`.
 * Direct (non-wrapper) calls keep their original arguments and result shape.
 */

import type { AdaptedInvocation, ContentCapability } from './types.js';

/** Arguments owned by the extension wrapper, never forwarded to a child. */
const WRAPPER_ONLY_KEYS = ['content_base64', 'output_path'] as const;

/** Adapt arguments before they reach the child server. */
export function adaptInvocation(capability: ContentCapability, args: unknown): AdaptedInvocation {
  const input = isRecord(args) ? args : {};
  const wrapperMode = WRAPPER_ONLY_KEYS.some((key) => Object.prototype.hasOwnProperty.call(input, key));
  if (!wrapperMode) return { args: input, wrapperMode: false, capability };

  const adapted: Record<string, unknown> = { ...input };
  const encoded = adapted.content_base64;
  delete adapted.output_path;
  if (!capability.declaredParams.has('file_path')) delete adapted.file_path;

  if (capability.contentParam) {
    delete adapted.content_base64;
    if (typeof encoded === 'string' && encoded.length > 0) {
      const decoded = decodeBase64Utf8(encoded);
      if (decoded === null) {
        return { args: adapted, wrapperMode: true, capability, error: 'Invalid content_base64 payload.' };
      }
      adapted[capability.contentParam] = decoded;
    } else if (typeof adapted[capability.contentParam] !== 'string') {
      return {
        args: adapted,
        wrapperMode: true,
        capability,
        error:
          `Missing content: pass file_path so the extension wrapper can inject content_base64 ` +
          `(or send ${capability.contentParam} directly).`,
      };
    }
  }

  return { args: adapted, wrapperMode: true, capability };
}

/** Strict UTF-8 base64 decode — rejects payloads that would silently corrupt the document. */
function decodeBase64Utf8(value: string): string | null {
  const compact = value.replace(/\s+/g, '');
  if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  return Buffer.from(compact, 'base64').toString('utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
