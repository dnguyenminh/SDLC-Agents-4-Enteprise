/**
 * Shared setup for Go parser unit tests (KSA-150).
 * Extracted from go-parser.test.ts to keep each file under the CI line-count
 * gate (<=200 lines). No logic changed — setup relocated.
 */

import { Parser, Language } from 'web-tree-sitter';
import * as fs from 'fs';
import * as path from 'path';
import GoParser from '../go-parser.js';

export const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

export async function setup() {
  await Parser.init();
  const parser = new Parser();
  const wasmPath = path.resolve(
    __dirname,
    '../../grammars/tree-sitter-go.wasm'
  );
  if (!fs.existsSync(wasmPath)) {
    console.error(`[skip] Go WASM grammar not found at ${wasmPath}`);
    return null;
  }
  const language = await Language.load(wasmPath);
  parser.setLanguage(language);
  return new GoParser(parser, 'go');
}
