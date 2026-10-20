/**
 * SA4E — Unit tests for the workspace file scanner (traversal, .gitignore
 * handling, language detection, metadata sidecar).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  scanWorkspace,
  scanSingleFile,
  detectLanguage,
  loadFileMetadata,
} from '../file-scanner.js';
import type { AppConfig } from '../../config.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-intel-scan-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(rel: string, content: string): string {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

function baseConfig(): AppConfig {
  return {
    port: 48721,
    host: '0.0.0.0',
    onnxModelPath: 'models/model.onnx',
    logLevel: 'info',
    viewerPort: 3202,
    watchEnabled: true,
    watchDebounceMs: 500,
    ollamaUrl: null,
    ollamaModel: 'nomic-embed-text',
    maxFileSize: 1_000_000,
    projectId: 'test-project',
    workspace: dir,
    indexTempDir: path.join(os.tmpdir(), 'CodeIntel'),
    dbPath: 'index.db',
    configPath: path.join(dir, '.code-intel', 'config.json'),
    dataDir: '.code-intel',
    sqliteDbPath: 'index.db',
    orchestrationConfigPath: 'orchestration.json',
    excludePatterns: ['node_modules', '.git'],
    includeExtensions: ['.ts', '.js', '.py', '.java', '.yml', '.gradle.kts'],
  };
}

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...baseConfig(), ...overrides };
}

describe('detectLanguage', () => {
  it('maps simple extensions to languages', () => {
    expect(detectLanguage('/a/b/app.ts')).toBe('typescript');
    expect(detectLanguage('/a/b/app.js')).toBe('javascript');
    expect(detectLanguage('/a/b/app.py')).toBe('python');
    expect(detectLanguage('/a/b/app.java')).toBe('java');
    expect(detectLanguage('/a/b/flow.cls')).toBe('apex');
  });

  it('resolves compound extensions for Salesforce metadata', () => {
    expect(detectLanguage('/a/b/Lead.object-meta.xml')).toBe('salesforce-meta');
    expect(detectLanguage('/a/b/Lead.field-meta.xml')).toBe('salesforce-meta');
    expect(detectLanguage('/a/b/flow.flow-meta.xml')).toBe('salesforce-meta');
  });

  // ---- SA4E-223: new simple extensions (TC-01) ----
  it('maps new Salesforce simple extensions to languages', () => {
    expect(detectLanguage('/a/MyClass.apex')).toBe('apex');
    expect(detectLanguage('/a/Query.soql')).toBe('apex');
    expect(detectLanguage('/a/MyPage.page')).toBe('visualforce');
    expect(detectLanguage('/a/MyComp.component')).toBe('visualforce');
    expect(detectLanguage('/a/MyCmp.cmp')).toBe('aura');
    expect(detectLanguage('/a/MyApp.app')).toBe('aura');
    expect(detectLanguage('/a/MyEvt.evt')).toBe('aura');
    expect(detectLanguage('/a/MyIntf.intf')).toBe('aura');
    expect(detectLanguage('/a/MyTokens.tokens')).toBe('aura');
  });

  // ---- SA4E-223: 17 compound suffixes -> salesforce-meta (TC-02) ----
  it('maps all 17 *-meta.xml suffixes to salesforce-meta', () => {
    const suffixes = ['flow', 'object', 'field', 'js', 'component', 'flexipage', 'permissionset',
      'profile', 'labels', 'tab', 'layout', 'report', 'dashboard', 'site', 'resource', 'email', 'testSuite'];
    for (const s of suffixes) {
      expect(detectLanguage(`/a/Name.${s}-meta.xml`)).toBe('salesforce-meta');
    }
  });

  // ---- SA4E-223: no Salesforce extension returns null (TC-03) ----
  it('returns non-null for every known Salesforce extension', () => {
    const paths = [
      'x.apex', 'x.soql', 'x.page', 'x.component', 'x.cmp', 'x.app', 'x.evt', 'x.intf', 'x.tokens',
      'x.flow-meta.xml', 'x.object-meta.xml', 'x.field-meta.xml', 'x.js-meta.xml', 'x.component-meta.xml',
      'x.flexipage-meta.xml', 'x.permissionset-meta.xml', 'x.profile-meta.xml', 'x.labels-meta.xml',
      'x.tab-meta.xml', 'x.layout-meta.xml', 'x.report-meta.xml', 'x.dashboard-meta.xml',
      'x.site-meta.xml', 'x.resource-meta.xml', 'x.email-meta.xml', 'x.testSuite-meta.xml',
    ];
    for (const p of paths) {
      expect(detectLanguage('/a/' + p)).not.toBeNull();
    }
  });

  // ---- SA4E-223: regression — .cls/.trigger/.pega unchanged (TC-05) ----
  it('keeps legacy apex mappings, pega removed for SRP', () => {
    expect(detectLanguage('/a/C.cls')).toBe('apex');
    expect(detectLanguage('/a/T.trigger')).toBe('apex');
    expect(detectLanguage('/a/R.pega')).toBeNull();
  });

  // ---- SA4E-223: unknown still null (TC-06) ----
  it('returns null for unknown extensions', () => {
    expect(detectLanguage('/a/b/readme.md')).toBeNull();
    expect(detectLanguage('/a/b/noext')).toBeNull();
  });

  it('maps .gradle.kts to kotlin', () => {
    expect(detectLanguage('/a/b/build.gradle.kts')).toBe('kotlin');
  });

  it('returns null for unknown extensions', () => {
    expect(detectLanguage('/a/b/readme.md')).toBeNull();
    expect(detectLanguage('/a/b/noext')).toBeNull();
  });

  it('is case-insensitive on the extension', () => {
    expect(detectLanguage('/a/b/App.TS')).toBe('typescript');
  });
});

describe('scanSingleFile', () => {
  it('returns metadata for a supported file', () => {
    const file = write('src/App.ts', 'export const x = 1;\n');
    const scanned = scanSingleFile(file, dir);
    expect(scanned).not.toBeNull();
    expect(scanned).toMatchObject({
      absolutePath: file,
      relativePath: 'src/App.ts',
      language: 'typescript',
      sizeBytes: Buffer.byteLength('export const x = 1;\n', 'utf-8'),
      lineCount: 2,
    });
    expect(scanned!.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns null for unsupported files', () => {
    const file = write('README.md', '# hi');
    expect(scanSingleFile(file, dir)).toBeNull();
  });

  it('returns null for missing files', () => {
    expect(scanSingleFile(path.join(dir, 'nope.ts'), dir)).toBeNull();
  });
});
