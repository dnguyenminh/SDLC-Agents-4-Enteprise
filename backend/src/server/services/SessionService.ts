import { createSession, validateSession, invalidateSession, refreshSession } from '../../admin/admin-db.js';

export class SessionService {
  async issue(userId: string, device?: string, ip?: string, userAgentHash?: string) {
    return createSession(userId, device, ip, userAgentHash);
  }
  async validate(token: string) {
    return validateSession(token);
  }
  async invalidate(token: string) {
    await invalidateSession(token);
  }
  async refresh(token: string) {
    return refreshSession(token);
  }
}
