import { createSession, validateSession, invalidateSession, refreshSession } from '../../admin/admin-db.js';
import { hashUserAgent } from '../utils/ua.js';

export class SessionService {
  async issue(userId: string, device?: string, ip?: string, userAgent?: string) {
    const userAgentHash = userAgent ? hashUserAgent(userAgent) : undefined;
    return createSession(userId, device, ip, userAgentHash);
  }
  async validate(token: string, userAgent?: string) {
    const userAgentHash = userAgent ? hashUserAgent(userAgent) : undefined;
    return validateSession(token, userAgentHash);
  }
  async invalidate(token: string) {
    await invalidateSession(token);
  }
  async refresh(token: string, userAgent?: string) {
    const userAgentHash = userAgent ? hashUserAgent(userAgent) : undefined;
    return refreshSession(token, userAgentHash);
  }
}
