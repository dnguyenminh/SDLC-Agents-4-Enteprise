/**
 * KSA-164: Taint Analyzer — Main taint analysis engine.
 * Combines CFG, data flow, and taint propagation to find source-to-sink paths.
 */

import type { SyntaxNode } from '../../../parsers/types.js';
import { CFGBuilder } from '../cfg/CFGBuilder.js';
import { DataFlowAnalyzer } from '../dataflow/DataFlowAnalyzer.js';
import { TaintRegistry } from './TaintRegistry.js';
import { TaintPropagator } from './TaintPropagator.js';
import type { TaintState } from './taint-types.js';
import type { ControlFlowGraph } from '../cfg/ControlFlowGraph.js';
import type { TaintResult, TaintPath, TaintSource, TaintSink, TaintStep, TaintOptions, TaintSinkType } from '../types/index.js';

export class TaintAnalyzer {
  private cfgBuilder: CFGBuilder;
  private dataFlowAnalyzer: DataFlowAnalyzer;
  private registry: TaintRegistry;
  private propagator: TaintPropagator;
  private cfgCache: Map<string, ControlFlowGraph> = new Map();
  private readonly MAX_CACHE = 100;

  constructor(registry?: TaintRegistry) {
    this.cfgBuilder = new CFGBuilder();
    this.dataFlowAnalyzer = new DataFlowAnalyzer();
    this.registry = registry ?? new TaintRegistry();
    this.propagator = new TaintPropagator(this.registry);
  }

  /** Perform taint analysis on a function node. */
  analyze(functionNode: SyntaxNode, language: string, options: TaintOptions = {}): TaintResult {
    const maxPathLength = options.maxPathLength ?? 20;

    // Build CFG
    const cfg = this.cfgBuilder.build(functionNode, language);

    // Propagate taint through CFG blocks in topological order
    const blockStates = new Map<number, Map<string, TaintState>>();
    const initialState = new Map<string, TaintState>();
    blockStates.set(cfg.entry.id, initialState);

    // Identify sources from function parameters
    this.identifyParamSources(functionNode, language, initialState);

    // Forward propagation through CFG
    for (const block of cfg.reversePostOrder()) {
      // Merge predecessor states
      const predecessors = cfg.getPredecessors(block);
      let mergedState: Map<string, TaintState>;

      if (predecessors.length === 0) {
        mergedState = new Map(blockStates.get(block.id) ?? initialState);
      } else {
        mergedState = new Map<string, TaintState>();
        for (const pred of predecessors) {
          const predState = blockStates.get(pred.id);
          if (predState) {
            for (const [key, val] of predState) {
              if (!mergedState.has(key)) mergedState.set(key, val);
            }
          }
        }
      }

      // Propagate through block
      const outState = this.propagator.propagateBlock(block, mergedState);
      blockStates.set(block.id, outState);
    }

    // Collect taint paths: find sinks that receive tainted data
    const paths: TaintPath[] = [];
    const sources: TaintSource[] = [];
    const sinks: TaintSink[] = [];

    for (const block of cfg.blocks) {
      const state = blockStates.get(block.id);
      if (!state) continue;

      for (const stmt of block.statements) {
        const sinkInfo = this.findSink(stmt.node, state, language);
        if (sinkInfo) {
          sinks.push(sinkInfo.sink);
          if (sinkInfo.taintState) {
            const path: TaintPath = {
              source: {
                variable: sinkInfo.taintState.variable,
                type: sinkInfo.taintState.sourceType as TaintSource['type'],
                line: sinkInfo.taintState.sourceLine,
                expression: sinkInfo.taintState.variable,
              },
              sink: sinkInfo.sink,
              chain: sinkInfo.taintState.steps.slice(0, maxPathLength),
              sanitized: false,
              length: sinkInfo.taintState.steps.length,
            };
            paths.push(path);

            // Track unique sources
            if (!sources.find(s => s.variable === path.source.variable && s.line === path.source.line)) {
              sources.push(path.source);
            }
          }
        }
      }
    }

    // Filter by options
    let filteredPaths = paths;
    if (options.sinkTypes) {
      filteredPaths = filteredPaths.filter(p => options.sinkTypes!.includes(p.sink.type));
    }
    if (options.sourceTypes) {
      filteredPaths = filteredPaths.filter(p => options.sourceTypes!.includes(p.source.type));
    }
    if (!options.includeSanitized) {
      filteredPaths = filteredPaths.filter(p => !p.sanitized);
    }

    return {
      paths: filteredPaths,
      sources,
      sinks,
      sanitizers: [],
    };
  }

  /** Get the taint registry for external configuration. */
  getRegistry(): TaintRegistry {
    return this.registry;
  }

  /** Identify taint sources from function parameters. */
  private identifyParamSources(
    functionNode: SyntaxNode,
    language: string,
    state: Map<string, TaintState>
  ): void {
    const params = functionNode.childForFieldName('parameters');
    if (!params) return;

    for (let i = 0; i < params.namedChildCount; i++) {
      const param = params.namedChild(i);
      if (!param) continue;

      let paramName: string | null = null;

      if (param.type === 'identifier') {
        paramName = param.text;
      } else if (param.type === 'required_parameter' || param.type === 'optional_parameter') {
        const nameNode = param.childForFieldName('pattern') ?? param.childForFieldName('name');
        if (nameNode) paramName = nameNode.text;
      } else if (param.type === 'formal_parameters') {
        continue;
      }

      if (!paramName) continue;

      // Common HTTP handler parameter names
      const httpParams = ['req', 'request', 'ctx', 'context'];
      if (httpParams.includes(paramName)) {
        state.set(paramName, {
          variable: paramName,
          tainted: true,
          sourceType: 'http_param',
          sourceLine: param.startPosition.row + 1,
          steps: [],
        });
      }
    }
  }

  /** Find a taint sink in a statement and check if it receives tainted data. */
  private findSink(
    node: SyntaxNode,
    state: Map<string, TaintState>,
    language: string
  ): { sink: TaintSink; taintState: TaintState | null } | null {
    if (node.type === 'call_expression' || node.type === 'expression_statement') {
      const callNode = node.type === 'expression_statement' ? node.namedChild(0) : node;
      if (!callNode || callNode.type !== 'call_expression') return null;

      const fn = callNode.childForFieldName('function');
      if (!fn) return null;

      const sinkMatch = this.registry.matchSink(fn.text, language);
      if (!sinkMatch) return null;

      const sink: TaintSink = {
        function: fn.text,
        type: sinkMatch.type,
        line: callNode.startPosition.row + 1,
        expression: callNode.text.slice(0, 100),
        paramIndex: sinkMatch.paramIndex,
      };

      // Check if the relevant argument is tainted
      const args = callNode.childForFieldName('arguments');
      if (args) {
        const targetArg = args.namedChild(sinkMatch.paramIndex);
        if (targetArg) {
          const taintInfo = this.propagator.evaluateExpression(targetArg, state);
          if (taintInfo.tainted) {
            return {
              sink,
              taintState: {
                variable: targetArg.text.slice(0, 50),
                tainted: true,
                sourceType: taintInfo.sourceType,
                sourceLine: taintInfo.sourceLine,
                steps: taintInfo.steps,
              },
            };
          }
        }
      }

      return { sink, taintState: null };
    }

    // Recurse into child expressions
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) {
        const result = this.findSink(child, state, language);
        if (result?.taintState) return result;
      }
    }

    return null;
  }
}