import { Hono } from 'hono';
import { z } from 'zod';
import { HeuristicIntentClassifier } from '../rag/query-router.js';
import { SemanticCache } from '../rag/semantic-cache.js';
import { AsyncQueueMock } from '../rag/async-queue.js';
import { SummaryTreeBuilder } from '../rag/summary-tree.js';

const querySchema = z.object({
  query_text: z.string().min(1).max(2000),
  doc_id: z.string().uuid().optional(),
  async: z.boolean().optional().default(false)
});

const ingestSchema = z.object({
  doc_id: z.string().uuid().optional()
});

function jwtStub(c:any){
  const h=c.req.header('authorization')||'';
  if(!h.startsWith('Bearer ')) return c.json({error:'ERR_AUTH'},401);
  // stub validation
  return null;
}

export function createRagRoutes(){
  const app=new Hono();
  const classifier=new HeuristicIntentClassifier();
  const cache=new SemanticCache();
  const queue=new AsyncQueueMock();
  const builder=new SummaryTreeBuilder();

  app.post('/api/rag/query', async c=>{
    const auth=jwtStub(c); if(auth) return auth;
    const body=await c.req.json().catch(()=>null);
    const parsed=querySchema.safeParse(body);
    if(!parsed.success) return c.json({error:'ERR_VALIDATION'},400);
    const {query_text,doc_id,async:doAsync}=parsed.data;
    const cls=await classifier.classify(query_text,doc_id);
    if(doAsync){
      const jobId=await queue.enqueue({docId:doc_id||'',queryText:query_text,intent:cls.intent,userId:'u1'});
      return c.json({job_id:jobId,status_url:`/api/rag/query/status/${jobId}`},202);
    }
    const cached=doc_id?await cache.get(doc_id,cls.intent,query_text):null;
    if(cached) return c.json({answer:cached.answer,intent:cls.intent,confidence:cls.confidence,source_layer:cached.source_layer,cache_hit:true});
    return c.json({answer:'stub answer',intent:cls.intent,confidence:cls.confidence,source_layer:'document',cache_hit:false});
  });

  app.post('/api/rag/ingest', async c=>{
    const auth=jwtStub(c); if(auth) return auth;
    const body=await c.req.json().catch(()=>null);
    const parsed=ingestSchema.safeParse(body);
    if(!parsed.success) return c.json({error:'ERR_VALIDATION'},400);
    const docId=parsed.data.doc_id||crypto.randomUUID();
    // stub build
    await builder.build(docId,['chunk1']);
    return c.json({doc_id:docId,status:'queued',summary_cost_estimate_tokens:45000},202);
  });

  return app;
}
