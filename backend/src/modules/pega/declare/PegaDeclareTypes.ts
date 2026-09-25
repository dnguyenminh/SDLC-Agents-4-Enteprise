/**
 * PegaDeclareTypes — Type definitions for Pega Declarative Rules.
 * Covers: Declare Expression, Declare Trigger, Declare OnChange,
 * Declare Pages, Declare Constraints, Declare Index, Declare DecisionTable/DecisionTree.
 */

import type { ExprNode } from '../expression/pega-expr/nodes.js';

export type DeclareType =
  | 'Declare-Expression'
  | 'Declare-Trigger'
  | 'Declare-OnChange'
  | 'Declare-Pages'
  | 'Declare-Constraints'
  | 'Declare-Index'
  | 'Declare-DecisionTable'
  | 'Declare-DecisionTree';

export interface PegaDeclareRule {
  pxObjClass: string;
  pyName: string;
  pyLabel?: string;
  declareType: DeclareType;
}

/**
 * Declare Expression — .pyExpression evaluated when .pyProperty changes.
 * pxObjClass: Rule-Declare-Expressions
 */
export interface PegaDeclareExpression extends PegaDeclareRule {
  declareType: 'Declare-Expression';
  targetProperty: string;
  expression: string;
  expressionAst?: ExprNode;
}

/**
 * Declare OnChange — fires actions when .pyProperty changes.
 * pxObjClass: Rule-Declare-OnChange
 */
export interface DeclareOnChangeAction {
  type: 'runActivity' | 'runDataTransform' | 'setValue' | 'runReport';
  target: string;
  params?: Record<string, string>;
}

export interface PegaDeclareOnChange extends PegaDeclareRule {
  declareType: 'Declare-OnChange';
  targetProperty: string;
  whenCondition?: string;
  actions: DeclareOnChangeAction[];
}

/**
 * Declare Trigger — before/after/instead save/delete/open.
 * pxObjClass: Rule-Declare-Trigger
 */
export interface PegaDeclareTrigger extends PegaDeclareRule {
  declareType: 'Declare-Trigger';
  triggerType: 'before' | 'after' | 'instead';
  operation: 'save' | 'delete' | 'open';
  targetClass: string;
  whenCondition?: string;
  action: string;
  actionType: 'Activity' | 'DataTransform';
}

/**
 * Declare Pages — auto-load pages into clipboard.
 * pxObjClass: Rule-Declare-Pages
 */
export interface DeclarePageDefinition {
  name: string;
  source: 'dataPage' | 'dataTransform' | 'class' | 'clipboard';
  sourceRef: string;
  parameters?: Record<string, string>;
  scope?: 'requestor' | 'thread' | 'node';
}

export interface PegaDeclarePages extends PegaDeclareRule {
  declareType: 'Declare-Pages';
  pages: DeclarePageDefinition[];
}

/**
 * Declare Constraint — property value constraints.
 * pxObjClass: Rule-Declare-Constraints
 */
export interface PegaDeclareConstraint extends PegaDeclareRule {
  declareType: 'Declare-Constraints';
  property: string;
  constraintType: 'min' | 'max' | 'pattern' | 'list' | 'expression';
  constraintValue: string;
  message?: string;
}

/**
 * Declare Index — database index definitions.
 * pxObjClass: Rule-Declare-Index
 */
export interface PegaDeclareIndex extends PegaDeclareRule {
  declareType: 'Declare-Index';
  property: string;
  indexType?: 'unique' | 'duplicate' | 'compound';
  additionalProperties?: string[];
}

/**
 * Declare DecisionTable / DecisionTree — condition→result mapping.
 * pxObjClass: Rule-Declare-DecisionTable / Rule-Declare-DecisionTree
 */
export interface DeclareDecisionRow {
  condition: string;
  result: string;
}

export interface PegaDeclareDecisionTable extends PegaDeclareRule {
  declareType: 'Declare-DecisionTable';
  propertyEvaluated?: string;
  rows: DeclareDecisionRow[];
}

export interface PegaDeclareDecisionTree extends PegaDeclareRule {
  declareType: 'Declare-DecisionTree';
  propertyEvaluated?: string;
  rows: DeclareDecisionRow[];
}