import { describe, it, expect } from 'vitest';
import { PegaWorkItem } from '../../workflow/PegaWorkItem.js';

describe('PegaWorkItem', () => {
  it('creates with Active state by default', () => {
    const item = new PegaWorkItem('WI-001');
    expect(item.id).toBe('WI-001');
    expect(item.state).toBe('Active');
    expect(item.currentShapeId).toBeNull();
    expect(item.history).toHaveLength(0);
    expect(item.assignments).toHaveLength(0);
    expect(item.slaData).toEqual({});
  });

  it('creates with Pending state and current shape id', () => {
    const item = new PegaWorkItem('WI-002', 'Pending', 'shape-1');
    expect(item.id).toBe('WI-002');
    expect(item.state).toBe('Pending');
    expect(item.currentShapeId).toBe('shape-1');
  });

  it('creates with Cancelled state', () => {
    const item = new PegaWorkItem('WI-003', 'Cancelled');
    expect(item.state).toBe('Cancelled');
  });

  it('creates with Resolved state', () => {
    const item = new PegaWorkItem('WI-004', 'Resolved');
    expect(item.state).toBe('Resolved');
  });

  it('addHistory records a history entry', () => {
    const item = new PegaWorkItem('WI-005', 'Active', 'shape-1');
    item.addHistory('shape-1', 'Start', 'enter', 'ok');
    expect(item.history).toHaveLength(1);
    const entry = item.history[0];
    expect(entry.shapeId).toBe('shape-1');
    expect(entry.shapeType).toBe('Start');
    expect(entry.action).toBe('enter');
    expect(entry.result).toBe('ok');
    expect(entry.timestamp).toBeDefined();
    expect(new Date(entry.timestamp).getTime()).not.toBeNaN();
  });

  it('addHistory appends multiple entries in order', () => {
    const item = new PegaWorkItem('WI-006', 'Active', 's1');
    item.addHistory('s1', 'Start', 'enter', 'ok');
    item.addHistory('s2', 'Action', 'process', 'completed');
    item.addHistory('s3', 'End', 'exit', 'finished');
    expect(item.history).toHaveLength(3);
    expect(item.history[0].shapeId).toBe('s1');
    expect(item.history[1].shapeId).toBe('s2');
    expect(item.history[2].shapeId).toBe('s3');
  });

  it('supports assignment tracking', () => {
    const item = new PegaWorkItem('WI-007');
    item.assignments.push({ actor: 'user1', deadline: '2026-08-01' });
    item.assignments.push({ actor: 'user2' });
    expect(item.assignments).toHaveLength(2);
    expect(item.assignments[0].actor).toBe('user1');
    expect(item.assignments[0].deadline).toBe('2026-08-01');
    expect(item.assignments[1].actor).toBe('user2');
  });

  it('tracks slaData as a dictionary', () => {
    const item = new PegaWorkItem('WI-008');
    item.slaData = { created: '2026-07-27T10:00:00Z', paused: null, breached: false };
    expect(item.slaData.created).toBe('2026-07-27T10:00:00Z');
    expect(item.slaData.breached).toBe(false);
  });
});
