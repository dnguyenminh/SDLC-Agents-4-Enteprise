/**
 * Shared setup for Java parser unit tests (KSA-149).
 * Extracted from java-parser.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — setup relocated.
 */

import { Parser, Language } from 'web-tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import JavaParser from '../java-parser.js';

export const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
export const GRAMMAR_PATH = path.resolve(__dirname, '../../grammars/tree-sitter-java.wasm');

export let parser: JavaParser;
export let grammarAvailable = false;

export async function setup(): Promise<void> {
  await Parser.init();
  const tsParser = new Parser();

  if (!fs.existsSync(GRAMMAR_PATH)) {
    console.error(`[SKIP] Java WASM grammar not found at ${GRAMMAR_PATH}`);
    return;
  }

  const language = await Language.load(GRAMMAR_PATH);
  tsParser.setLanguage(language);
  parser = new JavaParser(tsParser, 'java');
  grammarAvailable = true;
}

export function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

/** Read a fixture file and parse it with the same name (avoids duplicated arrange lines). */
export function parseFixture(name: string) {
  return parser.parse(readFixture(name), name);
}
