/**
 * SA4E-106 — Unit tests for PegaContentExtractor.
 * Verifies readable text extraction from raw Pega rule JSON.
 */

import { describe, it, expect } from 'vitest';
import { extractRuleContent, extractRuleContentWithFlags } from '../PegaContentExtractor.js';
import {
  MOCK_ACTIVITY_JSON,
  MOCK_DATA_TRANSFORM_JSON,
  MOCK_DECISION_TABLE_JSON,
} from './fixtures/pega-samples.js';

describe('PegaContentExtractor', () => {
  it('extracts identity header with type, class, name and ruleset', () => {
    const out = extractRuleContent(MOCK_ACTIVITY_JSON);
    expect(out).toContain('RULE TYPE: Rule-Obj-Activity');
    expect(out).toContain('CLASS: Work-Cover-Jira');
    expect(out).toContain('NAME: ResolveTicket');
    expect(out).toContain('RULESET: JiraIntegration (01-02-03)');
  });

  it('renders activity steps as readable logic with Call params', () => {
    const out = extractRuleContent(MOCK_ACTIVITY_JSON);
    expect(out).toContain('LOGIC (Activity Steps):');
    expect(out).toContain('[RowID:');

    const activity = {
      ...MOCK_ACTIVITY_JSON,
      steps: [...MOCK_ACTIVITY_JSON.steps, {
        pyStepNum: '3',
        pyMethod: 'Java',
        pyMethodParameters: 'Primary.setOutcome(.pyOutcome, "Resolved");',
        pyLabel: 'Set Outcome via Java',
      }],
    };
    const withJava = extractRuleContent(activity);
    expect(withJava).toContain('Java(Primary.setOutcome');
  });

  it('renders data transforms via normalizeDataTransform', () => {
    const out = extractRuleContent(MOCK_DATA_TRANSFORM_JSON);
    expect(out).toContain('LOGIC (Data Transform):');
    expect(out).toContain('DATA TRANSFORM:');
  });

  it('renders decision table rows', () => {
    const decision = {
      ...MOCK_DECISION_TABLE_JSON,
      pyDecisionRules: [
        { pyWhenCondition: 'pyStatus = "Open"', pyResult: 'High' },
      ],
    };
    const out = extractRuleContent(decision);
    expect(out).toContain('LOGIC (Decision Table):');
    expect(out).toContain('pyStatus = "Open"');
  });

  it('extracts parameters section when pyParameters present', () => {
    const out = extractRuleContent({
      ...MOCK_ACTIVITY_JSON,
      pyParameters: [
        { pyParameterName: 'caseID', pyDefaultValue: '0', pyMode: 'in' },
      ],
    });
    expect(out).toContain('PARAMETERS:');
    expect(out).toContain('caseID');
  });

  it('extracts top-level Java code fields', () => {
    const out = extractRuleContent({
      ...MOCK_ACTIVITY_JSON,
      pyJavaCode: 'public void run() { ctx.log("hi"); }',
    });
    expect(out).toContain('JAVA:');
    expect(out).toContain('pyJavaCode:');
    expect(out).toContain('public void run()');
  });

  it('excludes internal px/pz metadata from field dump', () => {
    const out = extractRuleContent({
      ...MOCK_ACTIVITY_JSON,
      pxUpdateOperator: 'admin',
      pzInsKey: 'KEYX',
      pySomeCustom: 'value',
    });
    expect(out).not.toContain('pxUpdateOperator');
    expect(out).not.toContain('pzInsKey');
    expect(out).toContain('pySomeCustom: value');
  });

  it('handles empty/minimal rule without throwing', () => {
    const out = extractRuleContent({ pxObjClass: 'Rule-Obj-Flow', pyClassName: 'Work', pyRuleName: 'F' });
    expect(out).toContain('RULE TYPE: Rule-Obj-Flow');
    expect(out).toContain('NAME: F');
  });

  it('SA4E-222: routes an unhandled type with nestedLogicPaths to schema-driven rendering', () => {
    const out = extractRuleContent(
      {
        pxObjClass: 'Rule-Obj-Property',
        pyClassName: 'Work',
        pyRuleName: 'Status',
        pyConditions: [{ name: 'c1', when: 'a', result: 'b' }],
      },
      { nestedLogicPaths: ['pyConditions'] },
    );
    expect(out).toContain('LOGIC (generic: pyConditions):');
    expect(out).toContain('c1');
  });

  it('SA4E-222: unhandled type with logic-bearing array uses the generic extractor', () => {
    const out = extractRuleContent({
      pxObjClass: 'Rule-Obj-Property',
      pyClassName: 'Work',
      pyRuleName: 'Status',
      pyInputs: [{ label: 'Gold', value: '100', result: 'VIP' }],
    });
    expect(out).toContain('LOGIC (generic: pyInputs):');
    expect(out).toContain('VIP');
  });

  it('SA4E-222: dedicated extractors still preferred (Activity unchanged)', () => {
    const out = extractRuleContent(MOCK_ACTIVITY_JSON);
    expect(out).toContain('LOGIC (Activity Steps):');
    expect(out).not.toContain('LOGIC (generic:');
  });

  it('SA4E-338 B2: drops an embedded base64 binary asset and flags it', () => {
    // Simulate Data-Mobile-Application-Branding-Asset.pyAssetSource (a base64 ZIP).
    const base64Zip = 'UEsDBAoAAAAAA' + 'A'.repeat(50000);
    const { content, binaryStripped } = extractRuleContentWithFlags({
      pxObjClass: 'Data-Mobile-Application-Branding-Asset',
      pyClassName: '@baseclass',
      pyRuleName: 'green',
      pyAssetName: 'green.zip',
      pyAssetSource: base64Zip,
    });
    expect(binaryStripped).toBe(true);
    expect(content).not.toContain(base64Zip);
    expect(content).toContain('[binary content omitted');
    // Non-binary metadata is still indexed.
    expect(content).toContain('pyAssetName: green.zip');
    // Whole body stays small (no context overflow).
    expect(content.length).toBeLessThan(5000);
  });

  it('SA4E-338 B2: truncates an unusually long but non-binary field', () => {
    const longProse = 'the quick brown fox jumps over the lazy dog. '.repeat(500);
    const { content, binaryStripped } = extractRuleContentWithFlags({
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Work',
      pyRuleName: 'A',
      pyNote: longProse,
    });
    // Prose is not binary — kept but bounded, not flagged as binary.
    expect(binaryStripped).toBe(false);
    expect(content).toContain('…[truncated]');
  });

  it('SA4E-338 B2: ordinary short fields are not flagged as binary', () => {
    const { binaryStripped } = extractRuleContentWithFlags(MOCK_ACTIVITY_JSON);
    expect(binaryStripped).toBe(false);
  });
});