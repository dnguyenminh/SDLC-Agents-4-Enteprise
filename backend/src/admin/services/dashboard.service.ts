/**
 * dashboard.service.ts — Dashboard health data service.
 * SA4E-50: getKbEntryCount is now async; getHealth is async.
 * NOTE: This service uses legacy raw db for activeSessions (schema init path).
 * KSA-286: Dashboard Service
 */
import pino from 'pino';
import type { DashboardHealth } from '../types/admin.types.js';
import * as os from 'os';
import * as fs from 'fs';
import { getKbEntryCount } from '../admin-db.js';

const logger = pino({ name: 'dashboard-service' });

export class DashboardService {
  private startTime = Date.now();
  constructor(private db: any, private mcpOrchestrator: any) {}

  async getHealth(): Promise<DashboardHealth> {
    const memUsage = process.memoryUsage();
    const cpus = os.cpus();
    const cpuPercent = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      return acc + ((total - cpu.times.idle) / total) * 100;
    }, 0) / cpus.length;

    let sqliteSize = 0;
    try {
      const stat = fs.statSync(this.db.name);
      sqliteSize = stat.size / (1024 * 1024);
    } catch { logger.debug({ context: 'dashboard-health' }, 'Could not stat SQLite db file for size'); }

    const activeSessions = this.db.prepare('SELECT COUNT(*) as cnt FROM sessions WHERE is_active = 1').get()?.cnt || 0;
    const alerts: DashboardHealth['alerts'] = [];
    if (memUsage.heapUsed / (1024 * 1024) > 80 * 0.01 * os.totalmem() / (1024 * 1024)) {
      alerts.push({ severity: 'warning', message: 'Memory usage > 80%', since: new Date().toISOString() });
    }

    const servers = this.mcpOrchestrator?.getServers?.() || [];
    const onlineCount = servers.filter((s: any) => s.status === 'RUNNING').length;
    const kbTotal = await getKbEntryCount();

    return {
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memoryUsageMB: Math.round(memUsage.heapUsed / (1024 * 1024)),
      cpuPercent: Math.round(cpuPercent * 10) / 10,
      sqliteFileSizeMB: Math.round(sqliteSize * 10) / 10,
      mcpServers: { online: onlineCount, total: servers.length },
      kbEntryCount: { user: 0, project: 0, shared: kbTotal },
      activeUsers: activeSessions,
      alerts,
    };
  }

  getActivity(limit = 20): any[] {
    return this.db.prepare(
      'SELECT audit_id, user_id, username, action, resource, timestamp FROM audit_entries ORDER BY timestamp DESC LIMIT ?',
    ).all(limit);
  }
}
