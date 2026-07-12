import * as fs from 'fs';
import * as path from 'path';

export function tierForType(type: string): string {
  switch (type) {
    case 'REQUIREMENT': case 'ARCHITECTURE': case 'PROCEDURE': case 'API_DESIGN': return 'SEMANTIC';
    case 'DECISION': case 'LESSON_LEARNED': case 'ERROR_PATTERN': return 'EPISODIC';
    default: return 'WORKING';
  }
}

export function inferOwner(source?: string): string {
  if (!source) return 'system';
  const s = source.toLowerCase();
  if (['ba','brd','fsd'].some(k => s.includes(k))) return 'ba-agent';
  if (['sa','tdd'].some(k => s.includes(k))) return 'sa-agent';
  if (['qa','stp','stc','test'].some(k => s.includes(k))) return 'qa-agent';
  if (['dev','code'].some(k => s.includes(k))) return 'dev-agent';
  return 'system';
}

export function resolvePath(fp: string, workspace: string): string {
  if (path.isAbsolute(fp) && fs.existsSync(fp)) return fp;
  const ws = path.resolve(workspace, fp);
  return fs.existsSync(ws) ? ws : path.resolve(fp);
}
