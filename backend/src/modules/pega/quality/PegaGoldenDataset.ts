/** PegaGoldenDataset — golden test samples + AST verification (BR-18 facade).
 *  Sample builders live in golden-samples-core.ts / golden-samples-more.ts. */
import type { PegaRuleAst } from '../PegaRuleAst.js';
import { PegaRuleAstParser } from '../PegaRuleAstParser.js';
import {
  activitySample, dataTransformSample, flowSample, decisionTableSample,
  decisionTreeSample, whenSample, sectionSample,
} from './golden-samples-core.js';
import {
  connectRestSample, declareExpressionSample, flowActionSample, classSample,
  declarePagesSample, utilitySample, connectSOAPSample, accessRoleSample,
} from './golden-samples-more.js';

export interface GoldenTestSample {
  name: string;
  pxObjClass: string;
  json: Record<string, unknown>;
  expectedReferences: string[];
  expectedSummary?: string;
  expectedChildren: number;
}

export interface VerificationResult {
  sampleName: string;
  passed: boolean;
  issues: string[];
  ast: PegaRuleAst;
}

export class PegaGoldenDataset {
  private parser = new PegaRuleAstParser();

  getActivitySample(): GoldenTestSample {
    return activitySample();
  }

  getDataTransformSample(): GoldenTestSample {
    return dataTransformSample();
  }

  getFlowSample(): GoldenTestSample {
    return flowSample();
  }

  getDecisionTableSample(): GoldenTestSample {
    return decisionTableSample();
  }

  getDecisionTreeSample(): GoldenTestSample {
    return decisionTreeSample();
  }

  getWhenSample(): GoldenTestSample {
    return whenSample();
  }

  getSectionSample(): GoldenTestSample {
    return sectionSample();
  }

  getConnectRestSample(): GoldenTestSample {
    return connectRestSample();
  }

  getDeclareExpressionSample(): GoldenTestSample {
    return declareExpressionSample();
  }

  getFlowActionSample(): GoldenTestSample {
    return flowActionSample();
  }

  getClassSample(): GoldenTestSample {
    return classSample();
  }

  getDeclarePagesSample(): GoldenTestSample {
    return declarePagesSample();
  }

  getUtilitySample(): GoldenTestSample {
    return utilitySample();
  }

  getConnectSOAPSample(): GoldenTestSample {
    return connectSOAPSample();
  }

  getAccessRoleSample(): GoldenTestSample {
    return accessRoleSample();
  }

  getAllSamples(): GoldenTestSample[] {
    return [
      this.getActivitySample(),
      this.getDataTransformSample(),
      this.getFlowSample(),
      this.getDecisionTableSample(),
      this.getDecisionTreeSample(),
      this.getWhenSample(),
      this.getSectionSample(),
      this.getConnectRestSample(),
      this.getDeclareExpressionSample(),
      this.getFlowActionSample(),
      this.getClassSample(),
      this.getDeclarePagesSample(),
      this.getUtilitySample(),
      this.getConnectSOAPSample(),
      this.getAccessRoleSample(),
    ];
  }

  verify(sample: GoldenTestSample, ast: PegaRuleAst): VerificationResult {
    const issues: string[] = [];

    if (ast.ruleType !== sample.pxObjClass) {
      issues.push(`Expected ruleType ${sample.pxObjClass}, got ${ast.ruleType}`);
    }

    if (ast.name !== sample.name) {
      issues.push(`Expected name ${sample.name}, got ${ast.name}`);
    }

    if (ast.children.length !== sample.expectedChildren) {
      issues.push(`Expected ${sample.expectedChildren} children, got ${ast.children.length}`);
    }

    for (const refName of sample.expectedReferences) {
      const found = ast.references.some(r => r.ruleName === refName);
      if (!found) {
        issues.push(`Expected reference ${refName} not found in AST`);
      }
    }

    return {
      sampleName: sample.name,
      passed: issues.length === 0,
      issues,
      ast,
    };
  }
}
