import { describe,it,expect } from 'vitest';
import { AsyncQueueMock } from '../async-queue.js';

describe('AsyncQueueMock',()=>{
  it('enqueue and get',async()=>{
    const q=new AsyncQueueMock();
    const id=await q.enqueue({queryText:'q',intent:'GLOBAL',userId:'u'});
    const job=await q.get(id);
    expect(job?.id).toBe(id);
    expect(job?.status).toBe('queued');
  });
});
