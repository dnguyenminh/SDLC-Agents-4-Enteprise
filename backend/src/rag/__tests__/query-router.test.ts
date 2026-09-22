import { describe,it,expect } from 'vitest';
import { HeuristicIntentClassifier } from '../query-router.js';

describe('HeuristicIntentClassifier',()=>{
  const c=new HeuristicIntentClassifier();
  it('classifies GLOBAL',async()=>{
    const r=await c.classify('tóm tắt toàn bộ tài liệu');
    expect(r.intent).toBe('GLOBAL');
    expect(r.confidence).toBeGreaterThan(0.7);
  });
  it('classifies STRUCTURAL',async()=>{
    const r=await c.classify('cho xem mục lục chương');
    expect(r.intent).toBe('STRUCTURAL');
  });
  it('fallback low confidence',async()=>{
    const r=await c.classify('xyz');
    expect(r.low_confidence).toBe(true);
    expect(r.intent).toBe('LOCAL');
  });
});
