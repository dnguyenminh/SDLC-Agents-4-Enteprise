/**
 * KSA-165 — Unit tests for injection pattern matchers: XSS, command
 * injection, path traversal, deserialization, LDAP/XML.
 * Split from PatternMatcher.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect } from 'vitest';
import { XSSMatcher } from '../injection/patterns/XSSMatcher.js';
import { CommandInjectionMatcher } from '../injection/patterns/CommandInjectionMatcher.js';
import { PathTraversalMatcher } from '../injection/patterns/PathTraversalMatcher.js';
import { DeserializationMatcher } from '../injection/patterns/DeserializationMatcher.js';
import { LDAPXMLMatcher } from '../injection/patterns/LDAPXMLMatcher.js';
import { ctx, makePath } from './PatternMatcher.helpers.js';

describe('XSSMatcher', () => {
  it('matches innerHTML assignment with pass_through', () => {
    const matcher = new XSSMatcher();
    const path = makePath({
      sink: { function: 'element.innerHTML', type: 'html_output', line: 12, expression: 'el.innerHTML = userInput', paramIndex: 0 },
      chain: [{ variable: 'x', line: 4, action: 'pass_through', expression: 'x' }],
    });
    const finding = matcher.match(path, ctx);
    expect(finding).not.toBeNull();
    expect(finding!.category).toBe('xss');
    expect(finding!.cwe).toBe('CWE-79');
  });

  it('does not match when textContent is used', () => {
    const matcher = new XSSMatcher();
    const path = makePath({
      sink: { function: 'element.textContent', type: 'html_output', line: 12, expression: 'el.textContent = userInput', paramIndex: 0 },
      chain: [{ variable: 'x', line: 4, action: 'pass_through', expression: 'x' }],
    });
    expect(matcher.match(path, ctx)).toBeNull();
  });
});

describe('CommandInjectionMatcher', () => {
  it('matches exec with concatenation', () => {
    const matcher = new CommandInjectionMatcher();
    const path = makePath({
      sink: { function: 'child_process.exec(', type: 'shell_exec', line: 20, expression: 'exec("ls -l " + dir)', paramIndex: 0 },
      chain: [{ variable: 'dir', line: 2, action: 'concat', expression: 'dir' }],
    });
    const finding = matcher.match(path, ctx);
    expect(finding).not.toBeNull();
    expect(finding!.cwe).toBe('CWE-78');
  });

  it('does not match execFile', () => {
    const matcher = new CommandInjectionMatcher();
    const path = makePath({
      sink: { function: 'execFile(', type: 'shell_exec', line: 20, expression: 'execFile("ls", [dir])', paramIndex: 0 },
      chain: [{ variable: 'dir', line: 2, action: 'concat', expression: 'dir' }],
    });
    expect(matcher.match(path, ctx)).toBeNull();
  });

  it('matches eval with user input', () => {
    const matcher = new CommandInjectionMatcher();
    const path = makePath({
      sink: { function: 'eval(', type: 'eval', line: 22, expression: 'eval(code)', paramIndex: 0 },
      chain: [{ variable: 'code', line: 1, action: 'pass_through', expression: 'code' }],
    });
    expect(matcher.match(path, ctx)!.cwe).toBe('CWE-95');
  });
});

describe('PathTraversalMatcher', () => {
  it('matches readFileSync with template literal', () => {
    const matcher = new PathTraversalMatcher();
    const path = makePath({
      sink: { function: 'readFileSync(', type: 'file_path', line: 20, expression: 'readFileSync(`/data/${userPath}`)', paramIndex: 0 },
      chain: [{ variable: 'p', line: 2, action: 'template_literal', expression: 'p' }],
    });
    const finding = matcher.match(path, ctx);
    expect(finding).not.toBeNull();
    expect(finding!.cwe).toBe('CWE-22');
  });

  it('does not match when path.basename is used', () => {
    const matcher = new PathTraversalMatcher();
    const path = makePath({
      sink: { function: 'readFileSync(', type: 'file_path', line: 20, expression: 'readFileSync(path.basename(userPath))', paramIndex: 0 },
      chain: [{ variable: 'p', line: 2, action: 'concat', expression: 'p' }],
    });
    expect(matcher.match(path, ctx)).toBeNull();
  });
});

describe('DeserializationMatcher', () => {
  it('matches yaml.load', () => {
    const matcher = new DeserializationMatcher();
    const path = makePath({
      sink: { function: 'yaml.load(', type: 'deserialize', line: 5, expression: 'yaml.load(data)', paramIndex: 0 },
      chain: [{ variable: 'data', line: 1, action: 'pass_through', expression: 'data' }],
    });
    expect(matcher.match(path, ctx)!.cwe).toBe('CWE-502');
  });

  it('does not match yaml.safe_load', () => {
    const matcher = new DeserializationMatcher();
    const path = makePath({
      sink: { function: 'yaml.safe_load', type: 'deserialize', line: 5, expression: 'yaml.safe_load(data)', paramIndex: 0 },
      chain: [{ variable: 'data', line: 1, action: 'pass_through', expression: 'data' }],
    });
    expect(matcher.match(path, ctx)).toBeNull();
  });

  it('matches pickle.loads', () => {
    const matcher = new DeserializationMatcher();
    const path = makePath({
      sink: { function: 'pickle.loads(', type: 'deserialize', line: 5, expression: 'pickle.loads(raw)', paramIndex: 0 },
      chain: [{ variable: 'raw', line: 1, action: 'assign', expression: 'raw' }],
    });
    expect(matcher.match(path, ctx)).not.toBeNull();
  });
});

describe('LDAPXMLMatcher', () => {
  it('matches LDAP search with concatenation', () => {
    const matcher = new LDAPXMLMatcher();
    const path = makePath({
      sink: { function: 'ldap.search(', type: 'ldap_query', line: 8, expression: 'ldap.search(base, "uid=" + username)', paramIndex: 0 },
      chain: [{ variable: 'u', line: 1, action: 'concat', expression: 'u' }],
    });
    expect(matcher.match(path, ctx)!.cwe).toBe('CWE-90');
  });

  it('matches xpath with template literal', () => {
    const matcher = new LDAPXMLMatcher();
    const path = makePath({
      sink: { function: 'xpath(', type: 'ldap_query', line: 8, expression: 'xpath(`//user[@id=${id}]`)', paramIndex: 0 },
      chain: [{ variable: 'id', line: 1, action: 'template_literal', expression: 'id' }],
    });
    expect(matcher.match(path, ctx)!.cwe).toBe('CWE-643');
  });
});
