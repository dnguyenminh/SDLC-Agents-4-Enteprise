/**
 * PkceService — PKCE (Proof Key for Code Exchange) code verifier/challenge generation.
 * Used for SSO OAuth2 flows with S256 challenge method.
 */

import * as crypto from "crypto";

export class PkceService {
  /**
   * Generate a cryptographically random code verifier (43-128 chars, base64url).
   */
  generateCodeVerifier(): string {
    const bytes = crypto.randomBytes(32);
    return this.base64UrlEncode(bytes);
  }

  /**
   * Generate SHA-256 code challenge from verifier.
   */
  generateCodeChallenge(verifier: string): string {
    const hash = crypto.createHash("sha256").update(verifier).digest();
    return this.base64UrlEncode(hash);
  }

  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
}
