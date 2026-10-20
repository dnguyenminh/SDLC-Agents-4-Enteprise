/** Remaining AST builders: async/test/file/admin/utility/edit/corr/survey/generic (BR-18). */
import type { AstNode } from './PegaRuleAst.js';
import { SYSTEM_FIELDS } from './PegaRuleAst.js';
import { stripSystemFields, type AstBuildResult } from './ast-builders.js';

export function buildAsync(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  return { properties: props, children: [] };
}

export function buildTest(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];
  const cases = json.pyExpectations || json.pyAsserts || json.pyTestCases;
  if (Array.isArray(cases)) {
    for (const c of cases) {
      children.push({ type: 'Assertion', properties: stripSystemFields(c as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}

export function buildFile(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  return { properties: props, children: [] };
}

export function buildAdmin(json: Record<string, unknown>): AstBuildResult {
  return { properties: stripSystemFields(json), children: [] };
}

export function buildUtility(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];
  const params = json.pyParameters || json.pyInputParams;
  if (Array.isArray(params)) {
    for (const p of params) {
      children.push({ type: 'Parameter', properties: stripSystemFields(p as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}

export function buildEdit(json: Record<string, unknown>): AstBuildResult {
  return { properties: stripSystemFields(json), children: [] };
}

export function buildCorrespondence(json: Record<string, unknown>): AstBuildResult {
  return { properties: stripSystemFields(json), children: [] };
}

export function buildSurvey(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];
  const questions = json.pyQuestions || json.pyQuestionItems;
  if (Array.isArray(questions)) {
    for (const q of questions) {
      children.push({ type: 'Question', properties: stripSystemFields(q as Record<string, unknown>), children: [] });
    }
  }
  return { properties: props, children };
}

export function buildGeneric(json: Record<string, unknown>): AstBuildResult {
  const props = stripSystemFields(json);
  const children: AstNode[] = [];
  for (const [key, val] of Object.entries(json)) {
    if (SYSTEM_FIELDS.has(key)) continue;
    if (key.startsWith('px') || key.startsWith('pz')) continue;
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      const items = val as Record<string, unknown>[];
      children.push({
        type: key,
        properties: {},
        children: items.map(v => ({ type: 'Item', properties: stripSystemFields(v), children: [] })),
      });
    }
  }
  return { properties: props, children };
}
