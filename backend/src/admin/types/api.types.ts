/**
 * API response envelope types and error codes.
 * Implements: TDD §8, FSD §12.1 envelope format
 */

// ─── Envelope Format ────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: {
    code: AdminErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
}

// ─── Error Codes (TDD §8.1) ────────────────────────────────────────────────

export enum AdminErrorCode {
  // Auth
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROLE_DATA_DENIED = 'ROLE_DATA_DENIED',
  USER_DISABLED = 'USER_DISABLED',

  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  DUPLICATE_USERNAME = 'DUPLICATE_USERNAME',
  DUPLICATE_EMAIL = 'DUPLICATE_EMAIL',
  WEAK_PASSWORD = 'WEAK_PASSWORD',
  INVALID_ROLE_DATA = 'INVALID_ROLE_DATA',

  // Business logic
  LAST_SYSTEM_OWNER = 'LAST_SYSTEM_OWNER',
  CIRCULAR_LINK = 'CIRCULAR_LINK',
  ENTRY_NOT_FOUND = 'ENTRY_NOT_FOUND',
  GROUP_HAS_USERS = 'GROUP_HAS_USERS',
  PERMISSION_IN_USE = 'PERMISSION_IN_USE',
  IMPORT_TOO_LARGE = 'IMPORT_TOO_LARGE',
  CONCURRENT_EDIT = 'CONCURRENT_EDIT',

  // System
  SERVER_UNRESPONSIVE = 'SERVER_UNRESPONSIVE',
  RESTART_FAILED = 'RESTART_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// ─── Helper to create responses ─────────────────────────────────────────────

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { data, timestamp: new Date().toISOString() };
}

export function apiError(code: AdminErrorCode, message: string, details?: Record<string, unknown>): ApiErrorResponse {
  return {
    error: { code, message, ...(details ? { details } : {}) },
    timestamp: new Date().toISOString(),
  };
}
