import { describe, it, expect } from 'vitest';
import { PegaFlowGraph } from '../../workflow/PegaFlowGraph.js';
import type { ShapeNode, Connector } from '../../workflow/PegaFlowGraph.js';
import { PegaWorkflowEngine } from '../../workflow/PegaWorkflowEngine.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';

describe('PegaWorkflowEngine', () => {
  it('simulates a simple linear flow Start -> Action -> End', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('start', { id: 'start', type: 'Start', properties: {} });
    shapes.set('action', { id: 'action', type: 'Action', properties: {} });
    shapes.set('end', { id: 'end', type: 'End', properties: {} });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 'start', toShapeId: 'action', isDefault: true },
      { id: 'c2', fromShapeId: 'action', toShapeId: 'end', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(true);
    expect(result.currentNodeId).toBe('end');
    expect(result.history).toEqual(['start', 'action', 'end']);
    expect(result.log).toHaveLength(4);
    expect(result.log[0]).toContain('Start');
    expect(result.log[1]).toContain('Action');
    expect(result.log[2]).toContain('End');
    expect(result.log[3]).toContain('Reached END');
  });

  it('returns completed=true and stops at the first End shape reached', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('start', { id: 'start', type: 'Start', properties: {} });
    shapes.set('mid', { id: 'mid', type: 'Action', properties: {} });
    shapes.set('end1', { id: 'end1', type: 'End', properties: {} });
    shapes.set('end2', { id: 'end2', type: 'End', properties: {} });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 'start', toShapeId: 'mid', isDefault: true },
      { id: 'c2', fromShapeId: 'mid', toShapeId: 'end1', isDefault: true },
      { id: 'c3', fromShapeId: 'end1', toShapeId: 'end2', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(true);
    expect(result.currentNodeId).toBe('end1');
    expect(result.history).toEqual(['start', 'mid', 'end1']);
  });

  it('returns completed=false when the graph has no Start shape', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('a1', { id: 'a1', type: 'Action', properties: {} });
    shapes.set('e1', { id: 'e1', type: 'End', properties: {} });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 'a1', toShapeId: 'e1', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(false);
    expect(result.currentNodeId).toBe('');
  });

  it('stops and logs when a shape referenced by a connector is not in the graph', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('start', { id: 'start', type: 'Start', properties: {} });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 'start', toShapeId: 'missing', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(false);
    expect(result.currentNodeId).toBe('missing');
    expect(result.log.some(l => l.includes('not found'))).toBe(true);
  });

  it('stops when a shape has no outgoing connectors (dead end without End type)', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('start', { id: 'start', type: 'Start', properties: {} });
    shapes.set('dead', { id: 'dead', type: 'Action', properties: {} });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 'start', toShapeId: 'dead', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(false);
    expect(result.currentNodeId).toBe('dead');
  });

  it('starts from a specific shape when startShapeId is provided', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('s1', { id: 's1', type: 'Start', properties: {} });
    shapes.set('s2', { id: 's2', type: 'Action', properties: {} });
    shapes.set('s3', { id: 's3', type: 'End', properties: {} });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 's1', toShapeId: 's2', isDefault: true },
      { id: 'c2', fromShapeId: 's2', toShapeId: 's3', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context, 's2');
    expect(result.history[0]).toBe('s2');
    expect(result.history).toEqual(['s2', 's3']);
    expect(result.completed).toBe(true);
  });

  it('detects loops by exhausting the max step limit (50 steps)', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('start', { id: 'start', type: 'Start', properties: {} });
    shapes.set('loop', { id: 'loop', type: 'Action', properties: {} });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 'start', toShapeId: 'loop', isDefault: true },
      { id: 'c2', fromShapeId: 'loop', toShapeId: 'loop', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(false);
    expect(result.history).toHaveLength(50);
  });

  it('handles flow where End shape is identified via pyShapeType property', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('start', { id: 'start', type: 'Start', properties: {} });
    shapes.set('end', { id: 'end', type: 'CustomEnd', properties: { pyShapeType: 'End' } });
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 'start', toShapeId: 'end', isDefault: true },
    ];
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(true);
    expect(result.currentNodeId).toBe('end');
    expect(result.log.some(l => l.includes('END'))).toBe(true);
  });

  it('simulates flow with multiple sequential actions before reaching end', () => {
    const shapeIds = ['start', 'a1', 'a2', 'a3', 'end'];
    const shapes = new Map<string, ShapeNode>(
      shapeIds.map(id => [id, { id, type: id === 'start' ? 'Start' : id === 'end' ? 'End' : 'Action', properties: {} }]),
    );
    const connectors: Connector[] = [];
    for (let i = 0; i < shapeIds.length - 1; i++) {
      connectors.push({ id: `c${i}`, fromShapeId: shapeIds[i], toShapeId: shapeIds[i + 1], isDefault: true });
    }
    const graph = new PegaFlowGraph(shapes, connectors);
    const engine = new PegaWorkflowEngine();
    const context = new PegaClipboardContext({ pyWorkPage: {} });
    const result = engine.simulate(graph, context);
    expect(result.completed).toBe(true);
    expect(result.history).toEqual(shapeIds);
    expect(result.currentNodeId).toBe('end');
  });
});
