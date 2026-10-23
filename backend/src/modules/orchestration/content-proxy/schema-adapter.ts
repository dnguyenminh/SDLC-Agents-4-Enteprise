/**
 * Schema adapter — augments a child tool definition so the extension wrapper
 * can detect it and present `file_path`/`output_path` to the LLM.
 *
 * Markers (non-standard JSON-Schema keywords, ignored by validators):
 *  - `x-content-param`: the child argument the wrapper's `content_base64` maps to
 *    (the wrapper hides both the marker target and `content_base64` from the LLM).
 *  - `x-output-base64`: the child result is inlined as `output_base64`.
 */

import type { ToolDefinition } from '../../../types/tool.js';
import type { ContentCapability } from './types.js';

/** Return a copy of the tool definition carrying the content-proxy markers. */
export function adaptToolDefinition(tool: ToolDefinition, capability: ContentCapability): ToolDefinition {
  const inputSchema = { ...(tool.inputSchema ?? {}) } as Record<string, any>;
  const properties = { ...((inputSchema.properties as Record<string, any>) ?? {}) };
  const required: string[] = Array.isArray(inputSchema.required) ? [...inputSchema.required] : [];

  if (capability.contentParam) {
    properties.content_base64 = {
      type: 'string',
      description:
        'Base64-encoded content injected by the extension wrapper (file_path → content). ' +
        'Never send this from an LLM.',
    };
    inputSchema['x-content-param'] = capability.contentParam;
    // The wrapper supplies this argument, so the child param must not stay required.
    const index = required.indexOf(capability.contentParam);
    if (index >= 0) required.splice(index, 1);
  }

  if (capability.fileOutput) {
    inputSchema['x-output-base64'] = true;
  }

  inputSchema.properties = properties;
  inputSchema.required = required;

  return {
    ...tool,
    description: capability.fileOutput ? withOutputMarker(tool.description) : tool.description,
    inputSchema,
  };
}

/** Advertise base64 output (the extension also accepts the `x-output-base64` marker). */
function withOutputMarker(description: string): string {
  if (description.includes('output_base64')) return description;
  const base = description.endsWith('.') ? description : `${description}.`;
  return `${base} Returns output_base64 (base64 file bytes) when invoked through the extension wrapper.`;
}
