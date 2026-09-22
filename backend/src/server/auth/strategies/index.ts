import { SsoStrategyRegistry, ssoStrategyRegistry } from './SsoStrategyRegistry.js';
import { EntraProviderStrategy } from './EntraProviderStrategy.js';
import { GoogleProviderStrategy } from './GoogleProviderStrategy.js';
import { GitHubProviderStrategy } from './GitHubProviderStrategy.js';

export * from './SsoProviderStrategy.js';
export * from './SsoStrategyRegistry.js';
export * from './EntraProviderStrategy.js';
export * from './GoogleProviderStrategy.js';
export * from './GitHubProviderStrategy.js';

// Register built-in default strategies
ssoStrategyRegistry.register(new EntraProviderStrategy());
ssoStrategyRegistry.register(new GoogleProviderStrategy());
ssoStrategyRegistry.register(new GitHubProviderStrategy());
