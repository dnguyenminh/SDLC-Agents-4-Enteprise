import { describe,it,expect } from 'vitest';
import { SummaryTreeBuilder } from '../summary-tree.js';

describe('SummaryTreeBuilder',()=>{
  it('builds 3 tiers',async()=>{
    const b=new SummaryTreeBuilder();
    const nodes=await b.build('doc1',['a','b','c','d']);
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    const layers=new Set(nodes.map(n=>n.layer));
    expect(layers.has('document')).toBe(true);
  });
});
