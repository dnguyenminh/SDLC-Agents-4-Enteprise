import { describe, it, expect } from 'vitest';
import { PegaFlowGraphBuilder } from '../../workflow/PegaFlowGraphBuilder.js';

describe('PegaFlowGraphBuilder', () => {
  it('builds graph from valid shapes and connectors JSON with pyID fields', () => {
    const shapes = [
      { pyID: 'start', pyShapeType: 'Start', pyLabel: 'Begin' },
      { pyID: 'act1', pyShapeType: 'Action', pyLabel: 'Step 1' },
      { pyID: 'end', pyShapeType: 'End', pyLabel: 'Finish' },
    ];
    const connectors = [
      { pyID: 'c1', pyFromShape: 'start', pyToShape: 'act1', pyIsDefault: true },
      { pyID: 'c2', pyFromShape: 'act1', pyToShape: 'end', pyIsDefault: true },
    ];
    const builder = new PegaFlowGraphBuilder();
    const graph = builder.build(shapes, connectors);
    expect(graph.getShape('start')).toBeDefined();
    expect(graph.getShape('start')!.type).toBe('Start');
    expect(graph.getShape('act1')).toBeDefined();
    expect(graph.getShape('act1')!.type).toBe('Action');
    expect(graph.getShape('end')).toBeDefined();
    expect(graph.getShape('end')!.type).toBe('End');
    expect(graph.getOutgoingConnectors('start')).toHaveLength(1);
    expect(graph.getOutgoingConnectors('start')[0].toShapeId).toBe('act1');
    expect(graph.getOutgoingConnectors('act1')[0].toShapeId).toBe('end');
  });

  it('builds graph with alternate field names (id, type, fromShapeId, toShapeId)', () => {
    const shapes = [
      { id: 's1', type: 'Start' },
      { id: 's2', type: 'Action' },
      { id: 's3', type: 'End' },
    ];
    const connectors = [
      { id: 'c1', fromShapeId: 's1', toShapeId: 's2', isDefault: true },
      { id: 'c2', fromShapeId: 's2', toShapeId: 's3', isDefault: true },
    ];
    const builder = new PegaFlowGraphBuilder();
    const graph = builder.build(shapes, connectors);
    expect(graph.getShape('s1')).toBeDefined();
    expect(graph.getShape('s2')).toBeDefined();
    expect(graph.getShape('s3')).toBeDefined();
    expect(graph.getOutgoingConnectors('s1')[0].toShapeId).toBe('s2');
  });

  it('handles empty shapes and connectors arrays', () => {
    const builder = new PegaFlowGraphBuilder();
    const graph = builder.build([], []);
    expect(graph.getStartShape()).toBeUndefined();
    expect(graph.getEndShapes()).toHaveLength(0);
    expect(graph.getOutgoingConnectors('s1')).toHaveLength(0);
  });

  it('assigns default id when shape has no pyID or id field', () => {
    const shapes = [{ type: 'Start' }, { type: 'Action' }];
    const builder = new PegaFlowGraphBuilder();
    const graph = builder.build(shapes, []);
    expect(graph.getShape('shape_0')).toBeDefined();
    expect(graph.getShape('shape_0')!.type).toBe('Start');
    expect(graph.getShape('shape_1')).toBeDefined();
    expect(graph.getShape('shape_1')!.type).toBe('Action');
  });
});
