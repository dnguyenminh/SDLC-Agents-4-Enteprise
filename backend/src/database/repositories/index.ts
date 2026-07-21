/**
 * SA4E-50 — Repository layer barrel exports.
 * Single import point for all repositories, interfaces, and types.
 */

// Interfaces
export type {
  IGraphRepository,
  IUserRepository,
  ISymbolRepository,
  IAuditRepository,
  IKbRepository,
} from './interfaces.js';

// Types / DTOs
export type {
  GraphNodeCounts,
  UpsertNodeParams,
  AuditEntry,
  PaginatedResult,
} from './types.js';

// Implementations
export { GraphRepository } from './GraphRepository.js';
export { UserRepository } from './UserRepository.js';
export { SymbolRepository } from './SymbolRepository.js';
export { AuditRepository } from './AuditRepository.js';
export { KbRepository } from './KbRepository.js';
