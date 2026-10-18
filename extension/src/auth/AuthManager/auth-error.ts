/**
 * AuthManager — AuthError, thrown by all auth flows.
 */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
