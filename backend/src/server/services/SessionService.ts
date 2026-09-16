import { createSession, validateSession, invalidateSession, refreshSession } from '../../admin/admin-db.js';

export class SessionService {
  async issue(userId: string) {
    return createSession(userId);
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
