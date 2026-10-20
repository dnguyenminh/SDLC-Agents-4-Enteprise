import type { PegaClassDefinition } from '../metamodel/PegaClassDefinition.js';
import type { SemanticAnalysis } from './types.js';
import { analyzeActivity, analyzeDataTransform } from './analyzer-activity.js';
import { analyzeFlow, analyzeDecision } from './analyzer-flow.js';
import { analyzeSection, analyzeConnect } from './analyzer-ui.js';
import { analyzeDeclare, analyzeGeneric } from './analyzer-declare.js';

/**
 * PegaSemanticAnalyzer — dispatches per rule type to impl modules (BR-18).
 * Method bodies live in analyzer-activity.ts / analyzer-flow.ts /
 * analyzer-ui.ts / analyzer-declare.ts; this class keeps the public API.
 */
export class PegaSemanticAnalyzer {
  analyze(json: Record<string, unknown>): SemanticAnalysis {
    const pxObjClass = (json.pxObjClass as string) || 'Rule-Obj-Activity';
    const name = (json.pyRuleName as string)
      || (json.pyActivityName as string)
      || (json.pyModelName as string)
      || (json.pyFlowName as string)
      || (json.pyLabel as string)
      || '';

    switch (true) {
      case pxObjClass === 'Rule-Obj-Activity':
        return this.analyzeActivity(json);
      case pxObjClass === 'Rule-Obj-Model':
        return this.analyzeDataTransform(json);
      case pxObjClass === 'Rule-Obj-Flow':
        return this.analyzeFlow(json);
      case pxObjClass === 'Rule-Obj-Section' || pxObjClass.startsWith('Rule-HTML-') || pxObjClass.startsWith('Rule-UI-'):
        return this.analyzeSection(json);
      case pxObjClass === 'Rule-Declare-DecisionTable' || pxObjClass === 'Rule-Declare-DecisionTree' || pxObjClass.startsWith('Rule-Decision-'):
        return this.analyzeDecision(json);
      case pxObjClass.startsWith('Rule-Connect-') || pxObjClass.startsWith('Rule-Service-'):
        return this.analyzeConnect(json);
      case pxObjClass.startsWith('Rule-Declare-'):
        return this.analyzeDeclare(json);
      default: {
        const analysis: SemanticAnalysis = {
          ruleType: pxObjClass,
          name,
          summary: `This is a ${pxObjClass} rule named "${name}"`,
          intent: `Define a ${pxObjClass} configuration`,
          sideEffects: [],
          dependencies: [],
          conditions: [],
          dataFlow: [],
        };
        return analysis;
      }
    }
  }

  analyzeActivity(json: Record<string, unknown>): SemanticAnalysis {
    return analyzeActivity(json);
  }

  analyzeDataTransform(json: Record<string, unknown>): SemanticAnalysis {
    return analyzeDataTransform(json);
  }

  analyzeFlow(json: Record<string, unknown>): SemanticAnalysis {
    return analyzeFlow(json);
  }

  analyzeDecision(json: Record<string, unknown>): SemanticAnalysis {
    return analyzeDecision(json);
  }

  analyzeSection(json: Record<string, unknown>): SemanticAnalysis {
    return analyzeSection(json);
  }

  analyzeConnect(json: Record<string, unknown>): SemanticAnalysis {
    return analyzeConnect(json);
  }

  analyzeDeclare(json: Record<string, unknown>): SemanticAnalysis {
    return analyzeDeclare(json);
  }

  analyzeGeneric(json: Record<string, unknown>, classDef: PegaClassDefinition): SemanticAnalysis {
    return analyzeGeneric(json, classDef);
  }
}
