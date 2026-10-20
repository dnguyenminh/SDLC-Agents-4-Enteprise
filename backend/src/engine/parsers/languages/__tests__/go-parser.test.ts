/**
 * KSA-150: Go Parser — Unit Tests.
 * Tests symbol extraction, relationship detection, and Go-specific features.
 * setup() extracted to go-parser.fixtures.ts (line-count gate <=200).
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import GoParser from '../go-parser.js';
import { setup, FIXTURES_DIR } from './go-parser.fixtures.js';

let goParser: GoParser;

describe('GoParser', async () => {
  before(async () => {
    const p = await setup();
    if (!p) {
      console.error('Skipping Go parser tests — WASM grammar not available');
      return;
    }
    goParser = p;
  });

  describe('Symbol Extraction', () => {
    it('should extract functions', () => {
      if (!goParser) return;
      const source = `package main

func Hello(name string) string {
  return "Hello, " + name
}`;
      const result = goParser.parse(source, 'test.go');
      const funcs = result.symbols.filter(s => s.kind === 'function');
      assert.equal(funcs.length, 1);
      assert.equal(funcs[0].name, 'Hello');
      assert.equal(funcs[0].isExported, true);
      assert.ok(funcs[0].signature.includes('func Hello'));
    });

    it('should extract methods with receivers', () => {
      if (!goParser) return;
      const source = `package main

type Server struct{}

func (s *Server) Start() error {
  return nil
}

func (s Server) Name() string {
  return "server"
}`;
      const result = goParser.parse(source, 'test.go');
      const methods = result.symbols.filter(s => s.kind === 'method');
      assert.equal(methods.length, 2);

      const start = methods.find(m => m.name === 'Start')!;
      assert.equal(start.parentName, 'Server');
      assert.ok(start.modifiers?.includes('pointer_receiver'));

      const nameMethod = methods.find(m => m.name === 'Name')!;
      assert.ok(nameMethod.modifiers?.includes('value_receiver'));
    });

    it('should extract structs', () => {
      if (!goParser) return;
      const source = `package main

type Config struct {
  Host string
  Port int
}`;
      const result = goParser.parse(source, 'test.go');
      const structs = result.symbols.filter(s => s.kind === 'struct');
      assert.equal(structs.length, 1);
      assert.equal(structs[0].name, 'Config');
      assert.equal(structs[0].isExported, true);
    });

    it('should extract interfaces', () => {
      if (!goParser) return;
      const source = `package main

type Reader interface {
  Read(p []byte) (n int, err error)
}`;
      const result = goParser.parse(source, 'test.go');
      const ifaces = result.symbols.filter(s => s.kind === 'interface');
      assert.equal(ifaces.length, 1);
      assert.equal(ifaces[0].name, 'Reader');
    });

    it('should detect exported vs unexported', () => {
      if (!goParser) return;
      const source = `package main

func PublicFunc() {}
func privateFunc() {}

type PublicType struct{}
type privateType struct{}`;
      const result = goParser.parse(source, 'test.go');
      const pub = result.symbols.filter(s => s.isExported);
      const priv = result.symbols.filter(s => !s.isExported);
      assert.equal(pub.length, 2);
      assert.equal(priv.length, 2);
    });

    it('should extract constants and variables', () => {
      if (!goParser) return;
      const source = `package main

const MaxSize = 100
var defaultName = "test"`;
      const result = goParser.parse(source, 'test.go');
      assert.ok(result.symbols.some(s => s.name === 'MaxSize'));
      assert.ok(result.symbols.some(s => s.name === 'defaultName'));
    });
  });

  describe('Relationship Extraction', () => {
    it('should extract function calls', () => {
      if (!goParser) return;
      const source = `package main

import "fmt"

func main() {
  fmt.Println("hello")
  doWork()
}

func doWork() {}`;
      const result = goParser.parse(source, 'test.go');
      const calls = result.relationships.filter(r => r.kind === 'calls');
      assert.ok(calls.some(c => c.targetSymbol.includes('fmt.Println')));
      assert.ok(calls.some(c => c.targetSymbol === 'doWork'));
    });

    it('should detect goroutine calls', () => {
      if (!goParser) return;
      const source = `package main

func main() {
  go processAsync()
}

func processAsync() {}`;
      const result = goParser.parse(source, 'test.go');
      const calls = result.relationships.filter(r => r.kind === 'calls');
      const asyncCall = calls.find(c => c.targetSymbol === 'processAsync');
      assert.ok(asyncCall);
      assert.equal(asyncCall?.metadata?.async, true);
    });

    it('should detect deferred calls', () => {
      if (!goParser) return;
      const source = `package main

func main() {
  defer cleanup()
}

func cleanup() {}`;
      const result = goParser.parse(source, 'test.go');
      const calls = result.relationships.filter(r => r.kind === 'calls');
      const deferredCall = calls.find(c => c.targetSymbol === 'cleanup');
      assert.ok(deferredCall);
      assert.equal(deferredCall?.metadata?.deferred, true);
    });

    it('should extract imports', () => {
      if (!goParser) return;
      const source = `package main

import (
  "fmt"
  "os"
  log "github.com/sirupsen/logrus"
)

func main() {}`;
      const result = goParser.parse(source, 'test.go');
      const imports = result.relationships.filter(r => r.kind === 'imports');
      assert.ok(imports.some(i => i.targetSymbol === 'fmt'));
      assert.ok(imports.some(i => i.targetSymbol === 'os'));
      assert.ok(imports.some(i => i.targetSymbol === 'github.com/sirupsen/logrus'));
    });
  });

  describe('Go-Specific Features', () => {
    it('should skip generated files', () => {
      if (!goParser) return;
      const source = `// Code generated by protoc-gen-go. DO NOT EDIT.
package main

func GeneratedFunc() {}`;
      const result = goParser.parse(source, 'test.go');
      assert.equal(result.symbols.length, 0);
    });

    it('should handle multiple return values', () => {
      if (!goParser) return;
      const source = `package main

func divide(a, b int) (int, error) {
  return a / b, nil
}`;
      const result = goParser.parse(source, 'test.go');
      const fn = result.symbols.find(s => s.name === 'divide');
      assert.ok(fn);
      assert.ok(fn!.returnType?.includes('int'));
    });

    it('should parse fixture file without errors', () => {
      if (!goParser) return;
      const fixturePath = path.join(FIXTURES_DIR, 'simple.go');
      if (!fs.existsSync(fixturePath)) return;
      const source = fs.readFileSync(fixturePath, 'utf-8');
      const result = goParser.parse(source, 'simple.go');

      // Should have symbols
      assert.ok(result.symbols.length > 0, 'Should extract symbols');

      // Should have functions, methods, structs, interfaces
      assert.ok(result.symbols.some(s => s.kind === 'function'));
      assert.ok(result.symbols.some(s => s.kind === 'method'));
      assert.ok(result.symbols.some(s => s.kind === 'struct'));
      assert.ok(result.symbols.some(s => s.kind === 'interface'));

      // Should have relationships
      assert.ok(result.relationships.length > 0, 'Should extract relationships');
    });
  });
});
