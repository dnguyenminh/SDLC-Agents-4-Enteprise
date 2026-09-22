import { describe,it,expect } from 'vitest';
import { SemanticCache } from '../semantic-cache.js';

describe('SemanticCache',()=>{
  it('set and get',async()=>{
    const c=new SemanticCache();
    await c.set('d1','GLOBAL','tóm tắt', {answer:'a',source_layer:'document',ttl:60000});
    const e=await c.get('d1','GLOBAL','tóm tắt');
    expect(e?.answer).toBe('a');
  });
});
