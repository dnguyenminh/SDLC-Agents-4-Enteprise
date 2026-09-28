export type SummaryLayer = 'chunk'|'chapter'|'document';

export interface SummaryNode {
  id:string;
  docId:string;
  layer:SummaryLayer;
  parentId?:string|null;
  summaryText:string;
  metadata?:Record<string,unknown>;
}

export interface IEmbeddingService {
  embed(text:string): Promise<number[]>;
}

export class StubEmbeddingService implements IEmbeddingService {
  async embed(text:string): Promise<number[]>{
    // stub 384-dim zero vector
    return new Array(384).fill(0);
  }
}

export class SummaryTreeBuilder {
  constructor(private embedder:IEmbeddingService=new StubEmbeddingService()){}
  async build(docId:string, chunks:string[]): Promise<SummaryNode[]>{
    const nodes:SummaryNode[]=[];
    // Tier1 chunk summaries stub
    for(let i=0;i<chunks.length;i++){
      nodes.push({ id:`${docId}-c${i}`, docId, layer:'chunk', parentId:null, summaryText:`Summary of chunk ${i}` });
    }
    // Tier2 chapter stub: group 4 chunks
    const chapters=Math.max(1,Math.ceil(chunks.length/4));
    for(let i=0;i<chapters;i++){
      nodes.push({ id:`${docId}-ch${i}`, docId, layer:'chapter', parentId:null, summaryText:`Chapter ${i} summary` });
    }
    // Tier3 document
    nodes.push({ id:`${docId}-doc`, docId, layer:'document', parentId:null, summaryText:`Document summary for ${docId}` });
    return nodes;
  }
}
