/**
 * SA4E-417 — Tool argument schemas for the 4 core agent tools (16K Doc §13).
 *
 * Every tool call is validated against its schema BEFORE execution:
 * type / length / allowed characters / semantic rules. String args are never
 * interpolated into shell commands — execution uses a structured arg vector
 * (see sandbox.ts buildArgVector).
 */

export interface ArgFieldSpec {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Semantic constraint applied after basic type checks. */
  semantic?: 'workspace-relative-path' | 'free-text' | 'identifier' | 'line-number';
}

export interface ToolSchema {
  tool: string;
  description: string;
  fields: ArgFieldSpec[];
}

/** Shell metacharacters — forbidden in any string arg (no shell concat rule). */
export const SHELL_METACHARS = /[;&|`$<>(){}\[\]!\\\n\r]/;

export const CORE_TOOL_SCHEMAS: Record<string, ToolSchema> = {
  search_symbols: {
    tool: 'search_symbols',
    description: 'Lexical/semantic symbol search within the pinned snapshot.',
    fields: [
      { name: 'query', type: 'string', required: true, maxLength: 500, semantic: 'free-text' },
      { name: 'limit', type: 'number', min: 1, max: 100 },
      { name: 'kind', type: 'string', maxLength: 32, semantic: 'identifier' },
    ],
  },
  get_file_skeleton: {
    tool: 'get_file_skeleton',
    description: 'Progressive-disclosure skeleton of one workspace file.',
    fields: [
      { name: 'file_path', type: 'string', required: true, maxLength: 512, semantic: 'workspace-relative-path' },
      { name: 'max_depth', type: 'number', min: 1, max: 10 },
    ],
  },
  read_code_block: {
    tool: 'read_code_block',
    description: 'Read one code block by file + line range from the pinned snapshot.',
    fields: [
      { name: 'file_path', type: 'string', required: true, maxLength: 512, semantic: 'workspace-relative-path' },
      { name: 'start_line', type: 'number', required: true, min: 0, max: 1_000_000, semantic: 'line-number' },
      { name: 'end_line', type: 'number', required: true, min: 0, max: 1_000_000, semantic: 'line-number' },
    ],
  },
  query_call_graph: {
    tool: 'query_call_graph',
    description: 'Bounded graph expansion from one symbol within the pinned snapshot.',
    fields: [
      { name: 'symbol_id', type: 'string', required: true, maxLength: 128, semantic: 'identifier' },
      { name: 'max_depth', type: 'number', min: 1, max: 5 },
      { name: 'node_cap', type: 'number', min: 1, max: 200 },
    ],
  },
};

export interface ToolArgValidation {
  valid: boolean;
  errors: string[];
  sanitized: Record<string, unknown>;
}

/** Validate raw tool args against the tool schema. Never throws — returns errors. */
export function validateToolArgs(tool: string, args: Record<string, unknown>): ToolArgValidation {
  const schema = CORE_TOOL_SCHEMAS[tool];
  const errors: string[] = [];
  const sanitized: Record<string, unknown> = {};
  if (!schema) {
    return { valid: false, errors: [`UNKNOWN_TOOL: ${tool}`], sanitized };
  }
  for (const field of schema.fields) {
    const raw = args[field.name];
    const present = raw !== undefined && raw !== null;
    if (field.required && !present) {
      errors.push(`${field.name}: required`);
      continue;
    }
    if (!present) continue;
    if (field.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors.push(`${field.name}: must be a finite number`);
        continue;
      }
      if (field.min !== undefined && n < field.min) errors.push(`${field.name}: < min ${field.min}`);
      if (field.max !== undefined && n > field.max) errors.push(`${field.name}: > max ${field.max}`);
      sanitized[field.name] = n;
      continue;
    }
    if (field.type === 'boolean') {
      sanitized[field.name] = Boolean(raw);
      continue;
    }
    const s = String(raw);
    if (field.maxLength !== undefined && s.length > field.maxLength) {
      errors.push(`${field.name}: length ${s.length} > max ${field.maxLength}`);
      continue;
    }
    if (SHELL_METACHARS.test(s)) {
      errors.push(`${field.name}: shell metacharacters forbidden (no shell concat rule)`);
      continue;
    }
    if (field.semantic === 'workspace-relative-path') {
      const p = s.replaceAll('\\', '/');
      if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/')) errors.push(`${field.name}: absolute paths forbidden`);
      if (p.split('/').includes('..')) errors.push(`${field.name}: '..' segments forbidden`);
      continue;
    }
    if (field.semantic === 'line-number' || field.semantic === 'identifier') {
      if (field.semantic === 'identifier' && !/^[A-Za-z0-9_.:\-/@]+$/.test(s)) {
        errors.push(`${field.name}: identifier characters only`);
        continue;
      }
    }
    sanitized[field.name] = s;
  }
  return { valid: errors.length === 0, errors, sanitized };
}
