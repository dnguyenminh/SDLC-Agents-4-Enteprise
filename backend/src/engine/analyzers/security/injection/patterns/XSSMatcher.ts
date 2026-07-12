/**
 * KSA-165: XSS Matcher — 4 patterns for Cross-Site Scripting detection.
 */

import { PatternMatcher } from '../PatternMatcher.js';
import type { InjectionPattern } from '../../types/index.js';

export class XSSMatcher extends PatternMatcher {
  readonly category = 'xss';
  readonly patterns: InjectionPattern[] = [
    {
      id: 5,
      name: 'innerHTML Assignment with User Input',
      category: 'xss',
      cwe: 'CWE-79',
      severity: 'High',
      sinkPatterns: ['innerHTML', 'outerHTML', 'dangerouslySetInnerHTML'],
      dangerousOps: ['concat', 'template_literal', 'assign', 'pass_through'],
      safePatterns: ['DOMPurify', 'sanitize', 'textContent', 'innerText'],
      description: 'Use textContent/innerText instead of innerHTML, or sanitize with DOMPurify.sanitize(input)',
    },
    {
      id: 6,
      name: 'document.write with User Input',
      category: 'xss',
      cwe: 'CWE-79',
      severity: 'Critical',
      sinkPatterns: ['document.write(', 'document.writeln('],
      dangerousOps: ['concat', 'template_literal', 'pass_through'],
      safePatterns: ['encode', 'escape', 'sanitize'],
      description: 'Avoid document.write entirely. Use DOM manipulation methods with textContent.',
    },
    {
      id: 7,
      name: 'Reflected XSS in Server Response',
      category: 'xss',
      cwe: 'CWE-79',
      severity: 'High',
      sinkPatterns: ['res.send(', 'res.write(', 'response.write(', 'render('],
      dangerousOps: ['concat', 'template_literal', 'format_string'],
      safePatterns: ['escape', 'encode', 'sanitize', 'helmet', 'csp'],
      description: 'Use template engines with auto-escaping (EJS, Handlebars) or explicitly escape output.',
    },
    {
      id: 8,
      name: 'DOM-based XSS via URL Fragment',
      category: 'xss',
      cwe: 'CWE-79',
      severity: 'High',
      sinkPatterns: ['innerHTML', 'eval(', 'document.write(', 'location.href'],
      dangerousOps: ['pass_through', 'assign'],
      safePatterns: ['encodeURIComponent', 'sanitize', 'DOMPurify'],
      description: 'Sanitize URL fragments before DOM insertion. Use encodeURIComponent or DOMPurify.',
    },
  ];
}