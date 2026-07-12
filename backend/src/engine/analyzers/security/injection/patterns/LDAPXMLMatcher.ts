/**
 * KSA-165: LDAP/XML Matcher — 2 patterns for LDAP and XML injection.
 */

import { PatternMatcher } from '../PatternMatcher.js';
import type { InjectionPattern } from '../../types/index.js';

export class LDAPXMLMatcher extends PatternMatcher {
  readonly category = 'ldap_xml_injection';
  readonly patterns: InjectionPattern[] = [
    {
      id: 19,
      name: 'LDAP Injection via String Concatenation',
      category: 'ldap_xml_injection',
      cwe: 'CWE-90',
      severity: 'High',
      sinkPatterns: ['ldap.search(', 'ldap.bind(', 'ldapjs.search', 'search_s('],
      dangerousOps: ['concat', 'template_literal', 'format_string'],
      safePatterns: ['ldap.filter.escape', 'escape_filter_chars', 'ldapEscape'],
      description: 'Escape LDAP special characters: use ldap.filter.escape() or equivalent before inserting into LDAP filters.',
    },
    {
      id: 20,
      name: 'XPath Injection via User Input',
      category: 'ldap_xml_injection',
      cwe: 'CWE-643',
      severity: 'High',
      sinkPatterns: ['xpath(', 'evaluate(', 'selectNodes(', 'xmlDoc.find('],
      dangerousOps: ['concat', 'template_literal', 'format_string'],
      safePatterns: ['parameterize', 'compile(', 'XPathExpression'],
      description: 'Use parameterized XPath queries or pre-compiled expressions. Never concatenate user input into XPath strings.',
    },
  ];
}