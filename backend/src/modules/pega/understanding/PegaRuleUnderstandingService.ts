import { PegaSchemaInferrer } from '../inference/PegaSchemaInferrer.js';
import { PegaFieldDocumentor } from '../inference/PegaFieldDocumentor.js';
import { PegaSemanticAnalyzer } from '../semantic/PegaSemanticAnalyzer.js';
import { PegaRuleSimulator } from '../semantic/PegaRuleSimulator.js';
import { PegaReferenceExtractor } from '../references/PegaReferenceExtractor.js';
import { PegaMetaModelRegistry } from '../metamodel/PegaMetaModelRegistry.js';
import { PegaMetaModelCompiler } from '../metamodel/PegaMetaModelCompiler.js';
import type { PegaClassDefinition } from '../metamodel/PegaClassDefinition.js';
import type { SideEffect, DataFlowEntry, ConditionSummary } from '../semantic/types.js';
import type { ResolvedDependency } from '../references/PegaReferenceExtractor.js';
import type { SimulationResult, SimulationTrace } from '../semantic/PegaRuleSimulator.js';
import { toPromptContext as renderPromptContext } from './PegaRuleUnderstandingService/prompt-context.js';
import { buildDependencyGraphText, extractRuleName } from './PegaRuleUnderstandingService/helpers.js';

export interface PegaRuleUnderstanding {
  pxObjClass: string;
  name: string;
  className: string;
  fqn: string;

  schema: {
    classDefinition: PegaClassDefinition;
    fieldDocs: string;
    inferred: boolean;
  };

  semantics: {
    summary: string;
    intent: string;
    sideEffects: SideEffect[];
    dataFlow: DataFlowEntry[];
    conditions: ConditionSummary[];
  };

  dependencies: ResolvedDependency[];
  dependencyGraph: string;

  simulation: {
    input: Record<string, Record<string, unknown>> | null;
    result: SimulationResult | null;
    trace: SimulationTrace[];
  } | null;

  promptContext: string;
}

export class PegaRuleUnderstandingService {
  constructor(
    private inferrer: PegaSchemaInferrer,
    private documentor: PegaFieldDocumentor,
    private analyzer: PegaSemanticAnalyzer,
    private simulator: PegaRuleSimulator,
    private extractor: PegaReferenceExtractor,
    private registry: PegaMetaModelRegistry,
    private compiler: PegaMetaModelCompiler,
  ) {}

  async understand(json: Record<string, unknown>, options?: {
    simulate?: boolean;
    simulateInput?: Record<string, Record<string, unknown>>;
  }): Promise<PegaRuleUnderstanding> {
    const pxObjClass = (json.pxObjClass as string) || 'Rule-Obj-Activity';
    const className = (json.pyClassName as string) || '@baseclass';
    const name = extractRuleName(json);
    const fqn = `${pxObjClass}:${className}:${name}`;

    const wasKnown = this.registry.isKnownClass(pxObjClass);
    const classDef = this.inferrer.ensureSchema(pxObjClass, json, this.registry);
    const inferred = !wasKnown;

    const fieldDocs = this.documentor.generatePromptContext(pxObjClass, json, this.registry);
    const analysis = this.analyzer.analyze(json);
    const deps = this.extractor.extractFromRule(json);
    const dependencyGraph = buildDependencyGraphText(deps);

    let simulation: PegaRuleUnderstanding['simulation'] = null;
    if (options?.simulate) {
      simulation = await this.runSimulation(json, options.simulateInput);
    }

    const understanding: PegaRuleUnderstanding = {
      pxObjClass,
      name,
      className,
      fqn,
      schema: {
        classDefinition: classDef,
        fieldDocs,
        inferred,
      },
      semantics: {
        summary: analysis.summary,
        intent: analysis.intent,
        sideEffects: analysis.sideEffects,
        dataFlow: analysis.dataFlow,
        conditions: analysis.conditions,
      },
      dependencies: deps,
      dependencyGraph,
      simulation,
      promptContext: '',
    };

    understanding.promptContext = this.toPromptContext(understanding);

    return understanding;
  }

  toPromptContext(understanding: PegaRuleUnderstanding): string {
    return renderPromptContext(understanding);
  }

  private async runSimulation(
    json: Record<string, unknown>,
    simulateInput?: Record<string, Record<string, unknown>>,
  ): Promise<PegaRuleUnderstanding['simulation']> {
    const simInput = simulateInput || null;
    let simResult: SimulationResult | null;
    let simTrace: SimulationTrace[];

    try {
      simResult = await this.simulator.simulate({
        pxObjClass: (json.pxObjClass as string) || 'Rule-Obj-Activity',
        json,
        inputClipboard: simulateInput,
        options: { collectTrace: true },
      });
      simTrace = simResult.trace;
    } catch {
      simResult = null;
      simTrace = [];
    }

    return {
      input: simInput,
      result: simResult,
      trace: simTrace,
    };
  }
}
