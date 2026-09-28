export interface Job {
  id:string;
  docId?:string;
  queryText:string;
  intent:string;
  userId:string;
  status:'queued'|'processing'|'done'|'failed';
  result?:any;
}

export class AsyncQueueMock {
  private jobs=new Map<string,Job>();
  private counter=0;
  async enqueue(payload:Omit<Job,'id'|'status'>):Promise<string>{
    const id=`job-${++this.counter}`;
    this.jobs.set(id,{...payload,id,status:'queued'});
    return id;
  }
  async get(id:string){ return this.jobs.get(id)||null; }
  async processAll(){
    for(const j of this.jobs.values()){
      if(j.status==='queued'){
        j.status='processing';
        j.status='done';
        j.result={answer:'stub'};
      }
    }
  }
}
