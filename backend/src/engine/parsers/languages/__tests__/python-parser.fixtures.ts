/**
 * Shared setup for Python parser unit tests (KSA-148).
 * Extracted from python-parser.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — setup relocated.
 */

import { Parser, Language } from 'web-tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import PythonParser from '../python-parser.js';

export const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
export const GRAMMAR_PATH = path.resolve(__dirname, '../../grammars/tree-sitter-python.wasm');

export let parser: PythonParser;
export let grammarAvailable = false;

export async function setup(): Promise<void> {
  await Parser.init();
  const tsParser = new Parser();

  if (!fs.existsSync(GRAMMAR_PATH)) {
    console.error(`[SKIP] Python WASM grammar not found at ${GRAMMAR_PATH}`);
    return;
  }

  const language = await Language.load(GRAMMAR_PATH);
  tsParser.setLanguage(language);
  parser = new PythonParser(tsParser, 'python');
  grammarAvailable = true;
}

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

/** Read a fixture file and parse it with the same name (avoids duplicated arrange lines). */
export function parseFixture(name: string) {
  return parser.parse(readFixture(name), name);
}
