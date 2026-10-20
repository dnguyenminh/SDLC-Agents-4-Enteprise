/**
 * KSA-151: Rust Parser — Unit Tests.
 * Tests symbol extraction, relationship detection, and Rust-specific features.
 * Split into case modules (symbols / behavior) + fixtures to keep each file
 * under the CI line-count gate (<=200 lines). No logic changed — this entry
 * file preserves the original describe('RustParser') + before-hook structure.
 */

import { describe, it, before } from 'node:test';
import type RustParser from '../rust-parser.js';
import { setup } from './rust-parser.fixtures.js';
import { registerRustSymbolExtractionCases } from './rust-parser.symbols.cases.js';
import { registerRustBehaviorCases } from './rust-parser.behavior.cases.js';

describe('RustParser', () => {
  let rustParser: RustParser | null = null;

  before(async () => {
    const p = await setup();
    if (!p) {
      console.error('Skipping Rust parser tests — WASM grammar not available');
      return;
    }
    rustParser = p;
  });

  registerRustSymbolExtractionCases(() => rustParser);
  registerRustBehaviorCases(() => rustParser);
});
