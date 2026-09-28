import { createHash } from 'node:crypto';

export interface CacheEntry {
  answer:string;
  source_layer:string;
  created_at:number;
  ttl:number;
}

export class SemanticCache {
  private store=new Map<string,CacheEntry>();
  private sanitize(input:string){ return input.replace(/[^a-z0-9\u00C0-\u024F ]/gi,' ').toLowerCase().trim(); }
  private hashKey(docId:string,intent:string,query:string){
    const norm=this.sanitize(query);
    const raw=`${docId}:${intent}:${norm}`;
    return createHash('sha256').update(raw).digest('hex');
  }
  async get(docId:string,intent:string,query:string){ const k=this.hashKey(docId,intent,query); const e=this.store.get(k); if(!e) return null; if(Date.now()>e.created_at+e.ttl){ this.store.delete(k); return null; } return e; }
  async set(docId:string,intent:string,query:string,entry:Omit<CacheEntry,'created_at'>){ const k=this.hashKey(docId,intent,query); this.store.set(k,{...entry,created_at:Date.now()}); }
  async invalidate(docId:string){ for(const k of this.store.keys()){ if(k.startsWith(createHash('sha256').update(`${docId}:`).digest('hex').slice(0,16))) { /* simplified */ } } }
}
