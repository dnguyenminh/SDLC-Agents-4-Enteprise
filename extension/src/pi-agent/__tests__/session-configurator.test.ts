import { describe, it, expect } from 'vitest';
import { SessionConfigurator } from '../session-configurator';

describe('SessionConfigurator', () => {
  it('validates model BR-4', () => {
    expect(() => SessionConfigurator.validateModel('gpt-4o-mini')).not.toThrow();
    expect(() => SessionConfigurator.validateModel('unknown-model')).toThrow();
  });

  it('validates thinkingLevel BR-3', () => {
    expect(() => SessionConfigurator.validateThinkingLevel('high')).not.toThrow();
    expect(() => SessionConfigurator.validateThinkingLevel('invalid')).toThrow();
  });

  it('builds session config with model and thinkingLevel', () => {
    const cfg = SessionConfigurator.buildSessionConfig({
      model: 'gpt-4o-mini',
      thinkingLevel: 'medium',
      scopedModels: ['gpt-4o-mini'],
    });
    expect(cfg.model).toBe('gpt-4o-mini');
    expect(cfg.thinkingLevel).toBe('medium');
  });

  it('fallback to default model on invalid', () => {
    const cfg = SessionConfigurator.buildSessionConfig({
      model: 'bad-model' as any,
    });
    expect(cfg.model).toBe('gpt-4o-mini');
  });

  it('creates agent session with SDK', () => {
    const sdk = {
      SessionManager: { inMemory: (cwd: string) => ({ cwd }) },
      createAgentSession: (cfg: any) => ({ cfg }),
    };
    const session = SessionConfigurator.createAgentSession(sdk as any, '/ws', { model: 'gpt-4o-mini' });
    expect(session.cfg.cwd).toBe('/ws');
    expect(session.cfg.model).toBe('gpt-4o-mini');
  });
});
