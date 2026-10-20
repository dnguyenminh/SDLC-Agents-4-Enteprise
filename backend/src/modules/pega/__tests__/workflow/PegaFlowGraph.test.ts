import { describe, it, expect } from 'vitest';
import { PegaFlowGraph } from '../../workflow/PegaFlowGraph.js';
import type { ShapeNode, Connector } from '../../workflow/PegaFlowGraph.js';

describe('PegaFlowGraph', () => {
  it('getShape returns shape by id', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('s1', { id: 's1', type: 'Start', properties: {} });
    const graph = new PegaFlowGraph(shapes, []);
    expect(graph.getShape('s1')).toBeDefined();
    expect(graph.getShape('s1')!.id).toBe('s1');
    expect(graph.getShape('s1')!.type).toBe('Start');
  });

  it('getShape returns undefined for missing shape', () => {
    const graph = new PegaFlowGraph(new Map(), []);
    expect(graph.getShape('nonexistent')).toBeUndefined();
  });

  it('getStartShape finds shape by type Start', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('s1', { id: 's1', type: 'Start', properties: {} });
    shapes.set('s2', { id: 's2', type: 'Action', properties: {} });
    shapes.set('s3', { id: 's3', type: 'End', properties: {} });
    const graph = new PegaFlowGraph(shapes, []);
    const start = graph.getStartShape();
    expect(start).toBeDefined();
    expect(start!.id).toBe('s1');
  });

  it('getStartShape returns undefined when no Start shape exists', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('s1', { id: 's1', type: 'Action', properties: {} });
    const graph = new PegaFlowGraph(shapes, []);
    expect(graph.getStartShape()).toBeUndefined();
  });

  it('getStartShape finds shape by pyShapeType property Start', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('s1', { id: 's1', type: 'SomeType', properties: { pyShapeType: 'Start' } });
    const graph = new PegaFlowGraph(shapes, []);
    const start = graph.getStartShape();
    expect(start).toBeDefined();
    expect(start!.id).toBe('s1');
  });

  it('getEndShapes returns shapes with type End', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('s1', { id: 's1', type: 'Start', properties: {} });
    shapes.set('s2', { id: 's2', type: 'End', properties: {} });
    shapes.set('s3', { id: 's3', type: 'End', properties: {} });
    const graph = new PegaFlowGraph(shapes, []);
    const ends = graph.getEndShapes();
    expect(ends).toHaveLength(2);
    expect(ends.map(e => e.id)).toEqual(['s2', 's3']);
  });

  it('getEndShapes returns empty array when no End shapes exist', () => {
    const shapes = new Map<string, ShapeNode>();
    shapes.set('s1', { id: 's1', type: 'Start', properties: {} });
    const graph = new PegaFlowGraph(shapes, []);
    expect(graph.getEndShapes()).toHaveLength(0);
  });

  it('getOutgoingConnectors returns connectors from a shape', () => {
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 's1', toShapeId: 's2', isDefault: false },
      { id: 'c2', fromShapeId: 's1', toShapeId: 's3', isDefault: true },
      { id: 'c3', fromShapeId: 's2', toShapeId: 's3', isDefault: false },
    ];
    const graph = new PegaFlowGraph(new Map(), connectors);
    const outgoing = graph.getOutgoingConnectors('s1');
    expect(outgoing).toHaveLength(2);
    expect(outgoing.map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('getOutgoingConnectors returns empty for shape with no outgoing', () => {
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 's1', toShapeId: 's2', isDefault: false },
    ];
    const graph = new PegaFlowGraph(new Map(), connectors);
    expect(graph.getOutgoingConnectors('s2')).toHaveLength(0);
  });

  it('getIncomingConnectors returns connectors to a shape', () => {
    const connectors: Connector[] = [
      { id: 'c1', fromShapeId: 's1', toShapeId: 's3', isDefault: false },
      { id: 'c2', fromShapeId: 's2', toShapeId: 's3', isDefault: true },
    ];
    const graph = new PegaFlowGraph(new Map(), connectors);
    const incoming = graph.getIncomingConnectors('s3');
    expect(incoming).toHaveLength(2);
    expect(incoming.map(c => c.id)).toEqual(['c1', 'c2']);
  });
});
