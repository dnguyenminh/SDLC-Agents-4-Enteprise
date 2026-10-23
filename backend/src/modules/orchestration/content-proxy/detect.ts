/**
 * Capability detection — decides, from a child tool's name/description/schema,
 * whether the content proxy should adapt it.
 *
 * Only file-producing tools are adapted. That gate keeps the adapter away from
 * ordinary tools that also happen to have a `body`/`content` argument
 * (jira_create_issue, confluence_create_page, mem_ingest, …).
 */

import type { ContentCapability } from './types.js';
import {
  CONTENT_PARAM_ALIASES,
  CONTENT_PROXY_OVERRIDES,
  FILE_OUTPUT_DESCRIPTION,
  FILE_TOOL_NAME_PREFIXES,
  NON_CONTENT_PARAM,
} from '../../../config/ContentProxy.js';

/** Minimal shape of a child tool (raw MCP listTools entry). */
export interface ToolLike {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** Derive the content capability for a child tool, or null when it is not a file tool. */
export function detectCapability(tool: ToolLike): ContentCapability | null {
  const override = CONTENT_PROXY_OVERRIDES[tool.name];
  if (override?.enabled === false) return null;

  const fileOutput = override?.fileOutput ?? looksLikeFileOutput(tool);
  if (!fileOutput) return null;

  const schema = (tool.inputSchema ?? {}) as Record<string, any>;
  const properties = (schema.properties ?? {}) as Record<string, any>;
  // Already wrapper-native (declares content_base64 itself, e.g. drawio_export_png):
  // the extension handles it directly — no adaptation, no double mapping.
  if (properties.content_base64) return null;

  const contentParam = override?.contentParam !== undefined
    ? (override.contentParam ?? undefined)
    : detectContentParam(schema);

  return {
    contentParam,
    fileOutput,
    declaredParams: new Set(Object.keys(properties)),
  };
}

/** Pick the argument that carries document content. */
export function detectContentParam(schema: Record<string, any>): string | undefined {
  const properties = (schema?.properties ?? {}) as Record<string, any>;
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];

  for (const alias of CONTENT_PARAM_ALIASES) {
    if (properties[alias] && isStringLike(properties[alias])) return alias;
  }

  const candidates = required.filter(
    (name) => properties[name] && isStringLike(properties[name]) && !NON_CONTENT_PARAM.test(name),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function looksLikeFileOutput(tool: ToolLike): boolean {
  const name = tool.name.toLowerCase();
  if (FILE_TOOL_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  return FILE_OUTPUT_DESCRIPTION.test(tool.description ?? '');
}

/** JSON-Schema shape check that tolerates `anyOf`/`oneOf` unions (pydantic emits these). */
function isStringLike(property: unknown): boolean {
  if (!property || typeof property !== 'object') return false;
  const prop = property as Record<string, any>;
  if (prop.type === 'string') return true;
  const variants = [prop.anyOf, prop.oneOf].find(Array.isArray) as Array<Record<string, any>> | undefined;
  return !!variants?.some((variant) => variant?.type === 'string');
}
