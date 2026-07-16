/**
 * SA4E-42 — maps a connection state to a re-index action (Strategy selector).
 * Only terminal transitions act; transient states are no-ops (BR-10, IR-2).
 */
import type { ConnectionState } from '../types/health.js';
import type { ReindexAction } from './models/ReindexAction.js';

export class ReindexActionMapper {
  fromState(newState: ConnectionState): ReindexAction {
    if (newState === 'connected') return 'ingest';
    if (newState === 'disconnected' || newState === 'failed') return 'remove';
    return 'noop';
  }
}
