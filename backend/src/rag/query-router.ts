export type Intent = 'LOCAL'|'GLOBAL'|'RELATIONAL'|'STRUCTURAL';

export interface ClassificationResult {
  intent: Intent;
  confidence: number;
  low_confidence?: boolean;
}

export interface IIntentClassifier {
  classify(query: string, docId?: string): Promise<ClassificationResult>;
}

const GLOBAL_KEYWORDS = ['tóm tắt','tổng hợp','đếm','so sánh','mâu thuẫn','toàn bộ','overview','summary'];
const STRUCTURAL_KEYWORDS = ['mục lục','chương','phần','table of contents','toc','cấu trúc'];
const RELATIONAL_KEYWORDS = ['liên quan','so sánh giữa','relationship','mối quan hệ','tương quan'];

function normalize(s:string){return s.toLowerCase().trim();}
function countMatches(text:string, keywords:string[]){
  let c=0;
  for(const k of keywords){ if(text.includes(k)) c++; }
  return c;
}

export class HeuristicIntentClassifier implements IIntentClassifier {
  async classify(query:string, docId?:string): Promise<ClassificationResult>{
    const t = normalize(query);
    const g = countMatches(t, GLOBAL_KEYWORDS);
    const s = countMatches(t, STRUCTURAL_KEYWORDS);
    const r = countMatches(t, RELATIONAL_KEYWORDS);
    const max = Math.max(g,s,r,0);
    let intent:Intent='LOCAL';
    let conf = 0.5;
    if(max>0){
      if(g>=s && g>=r){ intent='GLOBAL'; conf=0.7+Math.min(0.3,g*0.1); }
      else if(s>=r){ intent='STRUCTURAL'; conf=0.7+Math.min(0.3,s*0.1); }
      else { intent='RELATIONAL'; conf=0.7+Math.min(0.3,r*0.1); }
    }
    if(conf<0.75){ return { intent:'LOCAL', confidence: conf, low_confidence:true }; }
    return { intent, confidence: Math.min(0.99,conf) };
  }
}
