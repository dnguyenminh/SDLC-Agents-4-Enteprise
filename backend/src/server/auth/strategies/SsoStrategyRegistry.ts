import type { SsoProviderStrategy } from './SsoProviderStrategy.js';

export class SsoStrategyRegistry {
  private static instance: SsoStrategyRegistry | null = null;
  private readonly strategies = new Map<string, SsoProviderStrategy>();

  static getInstance(): SsoStrategyRegistry {
    if (!SsoStrategyRegistry.instance) {
      SsoStrategyRegistry.instance = new SsoStrategyRegistry();
    }
    return SsoStrategyRegistry.instance;
  }

  register(strategy: SsoProviderStrategy): void {
    this.strategies.set(strategy.providerType.toLowerCase(), strategy);
  }

  get(providerType: string): SsoProviderStrategy | undefined {
    return this.strategies.get(providerType.toLowerCase());
  }

  has(providerType: string): boolean {
    return this.strategies.has(providerType.toLowerCase());
  }

  list(): string[] {
    return Array.from(this.strategies.keys());
  }

  clear(): void {
    this.strategies.clear();
  }

  static resetInstance(): void {
    SsoStrategyRegistry.instance = null;
  }
}

export const ssoStrategyRegistry = SsoStrategyRegistry.getInstance();
