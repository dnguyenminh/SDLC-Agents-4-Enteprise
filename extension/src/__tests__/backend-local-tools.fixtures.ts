/**
 * Shared fixtures for backend-local-tools tests (SA4E-356).
 * Extracted from backend-local-tools.test.ts so each test file stays ≤200 lines.
 */
import * as path from 'path';

export const TMP_DIR = path.join(__dirname, '.tmp-local-tools');

/** The three tool schemas seeded into Base64ProxyService.detectFromToolList. */
export const BASE64_DETECT_TOOLS = [
  {
    name: 'drawio_export_png',
    description: 'Export drawio to PNG. Returns output_base64 field.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content_base64: { type: 'string', description: 'Base64 file content' },
      },
      required: ['content_base64'],
    },
  },
  {
    name: 'mem_ingest_file',
    description: 'Ingest a file into memory.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        content_base64: { type: 'string', description: 'Base64 encoded file content' },
      },
      required: ['content_base64'],
    },
  },
  {
    name: 'code_search',
    description: 'Search code in the project.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
] as const;

/** Single drawio tool WITH content_base64 (input-proxy detection seed). */
export const DRAWIO_INPUT_TOOL = {
  name: 'drawio_export_png',
  description: 'Export drawio to PNG. Returns output_base64 field.',
  inputSchema: {
    type: 'object',
    properties: { file_path: { type: 'string' }, content_base64: { type: 'string' } },
    required: ['content_base64'],
  },
} as const;

/** Single drawio tool WITHOUT content_base64 (output-only rewrite seed). */
export const DRAWIO_NO_CBASE64_TOOL = {
  name: 'drawio_export_png',
  description: 'Export drawio to PNG. Returns output_base64 field.',
  inputSchema: {
    type: 'object',
    properties: { file_path: { type: 'string' } },
    required: [],
  },
} as const;

/** export_docx — input proxy (content_base64) + output proxy (output_base64). */
export const EXPORT_DOCX_TOOL = {
  name: 'export_docx',
  description: 'Export Markdown to DOCX. Returns output_base64 (base64 DOCX bytes).',
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      content_base64: { type: 'string' },
      output_path: { type: 'string' },
      file_name: { type: 'string' },
    },
    required: [],
  },
} as const;
