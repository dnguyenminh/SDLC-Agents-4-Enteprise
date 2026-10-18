/**
 * AuthManager — token adoption (login/refresh response handling).
 */

import type { TokenResponse } from "./auth-types";
import type { AuthManagerContext } from "./context";
import { SECRET_ACCESS_TOKEN, SECRET_REFRESH_TOKEN } from "./secrets";

/**
 * Adopt a login/refresh response: dual-token when the backend provides
 * accessToken/refreshToken, legacy single-token otherwise.
 */
export async function adoptTokensFlow(ctx: AuthManagerContext, data: TokenResponse, legacyExpiresAt?: number | null): Promise<void> {
  const refresh = data.refreshToken ?? data.token ?? null;
  const access = data.accessToken ?? data.token ?? null;
  if (refresh) {
    ctx.setRefreshTokenValue(refresh);
    await ctx.secrets.store(SECRET_REFRESH_TOKEN, refresh);
  }
  if (access) {
    ctx.setCachedToken(access);
    await ctx.secrets.store(SECRET_ACCESS_TOKEN, access);
  }
  ctx.setTokenAcquiredAt(Date.now());
  ctx.setTokenExpiresAt(data.accessToken
    ? Date.now() + (data.expiresIn && data.expiresIn > 0 ? data.expiresIn : 900) * 1000
    : data.expiresAt
      ? new Date(data.expiresAt).getTime()
      : legacyExpiresAt ?? null);
  ctx.scheduleAccessRefresh();
}
