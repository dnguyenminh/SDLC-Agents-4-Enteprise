/**
 * SA4E-42 UT-01..05 — ReindexActionMapper (state → action, BR-10 / IR-2).
 */
import { describe, it, expect } from 'vitest';
import { ReindexActionMapper } from '../ReindexActionMapper.js';

describe('ReindexActionMapper', () => {
  const mapper = new ReindexActionMapper();

  it('UT-01: connected → ingest', () => {
    expect(mapper.fromState('connected')).toBe('ingest');
  });
  it('UT-02: disconnected → remove', () => {
    expect(mapper.fromState('disconnected')).toBe('remove');
  });
  it('UT-03: failed → remove', () => {
    expect(mapper.fromState('failed')).toBe('remove');
  });
  it('UT-04: unhealthy → noop', () => {
    expect(mapper.fromState('unhealthy')).toBe('noop');
  });
  it('UT-05: reconnecting → noop', () => {
    expect(mapper.fromState('reconnecting')).toBe('noop');
  });
});
