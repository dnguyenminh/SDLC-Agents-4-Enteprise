/**
 * Regression test: LWC JavaScript class-field extraction.
 * tree-sitter-javascript names class fields `field_definition` (not the
 * TypeScript `public_field_definition`/`property_definition`). Before the fix,
 * these were dropped, so a component surfaced only `method` symbols. This test
 * verifies fields become `property` and arrow-function fields become `method`,
 * alongside regular methods and the class itself.
 *
 * Requires tree-sitter-javascript.wasm — skips gracefully if unavailable.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { Parser, Language } from 'web-tree-sitter';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import TypeScriptParser from '../typescript-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GRAMMAR_PATH = path.resolve(__dirname, '../../grammars/tree-sitter-javascript.wasm');

let parser: TypeScriptParser;
let grammarAvailable = false;

const LWC_SOURCE = `
import { LightningElement, api, track } from 'lwc';

export default class HelloWorld extends LightningElement {
    @api recordId;
    @track state = {};
    greeting = 'Hello';

    handleClick = (event) => {
        this.greeting = event.target.value;
    };

    connectedCallback() {
        this.greeting = 'Ready';
    }

    get computedLabel() {
        return this.greeting;
    }
}
`;

async function setup(): Promise<void> {
  await Parser.init();
  const tsParser = new Parser();
  if (!fs.existsSync(GRAMMAR_PATH)) {
    console.error(`[SKIP] JavaScript WASM grammar not found at ${GRAMMAR_PATH}`);
    return;
  }
  const language = await Language.load(GRAMMAR_PATH);
  tsParser.setLanguage(language);
  parser = new TypeScriptParser(tsParser, 'javascript');
  grammarAvailable = true;
}

describe('LWC JavaScript class-field extraction', () => {
  before(async () => { await setup(); });

  it('extracts the component class', () => {
    if (!grammarAvailable) return;
    const { symbols } = parser.parse(LWC_SOURCE, 'helloWorld.js');
    const cls = symbols.find(s => s.kind === 'class');
    assert.ok(cls, 'Should find class symbol');
    assert.equal(cls!.name, 'HelloWorld');
  });

  it('classifies plain/@api/@track fields as property', () => {
    if (!grammarAvailable) return;
    const { symbols } = parser.parse(LWC_SOURCE, 'helloWorld.js');
    const props = symbols.filter(s => s.kind === 'property').map(s => s.name);
    assert.ok(props.includes('recordId'), 'recordId should be a property');
    assert.ok(props.includes('state'), 'state should be a property');
    assert.ok(props.includes('greeting'), 'greeting should be a property');
  });

  it('classifies arrow-function fields as method with params', () => {
    if (!grammarAvailable) return;
    const { symbols } = parser.parse(LWC_SOURCE, 'helloWorld.js');
    const handler = symbols.find(s => s.name === 'handleClick');
    assert.ok(handler, 'handleClick should be extracted');
    assert.equal(handler!.kind, 'method');
    assert.match(handler!.signature ?? '', /event/, 'params should resolve from arrow function');
  });

  it('still extracts regular methods', () => {
    if (!grammarAvailable) return;
    const { symbols } = parser.parse(LWC_SOURCE, 'helloWorld.js');
    const method = symbols.find(s => s.name === 'connectedCallback');
    assert.ok(method, 'connectedCallback should be extracted');
    assert.equal(method!.kind, 'method');
  });

  it('produces more than one kind of symbol (regression: not all method)', () => {
    if (!grammarAvailable) return;
    const { symbols } = parser.parse(LWC_SOURCE, 'helloWorld.js');
    const kinds = new Set(symbols.map(s => s.kind));
    assert.ok(kinds.size >= 3, `Expected varied kinds, got: ${[...kinds].join(', ')}`);
  });
});
