/**
 * Container — lightweight DI container for constructor injection.
 * Registers services by constructor function (token). Resolves full
 * dependency trees, supports singletons and transient instances.
 *
 * Usage:
 *   const container = new Container();
 *   container.registerSingleton(Logger, pino());
 *   container.register(MyService); // auto-wired from constructor params
 *   const svc = container.resolve(MyService);
 */

type Token<T = any> = { new (...args: any[]): T } | string;
type FactoryFn<T> = (c: Container) => T;

interface Registration<T = any> {
  factory: FactoryFn<T>;
  singleton: boolean;
  instance?: T;
}

export class Container {
  private registry = new Map<Token, Registration>();
  private resolving = new Set<Token>();

  register<T>(token: Token<T>, factory?: FactoryFn<T>): void {
    this.registry.set(token, {
      factory: factory || ((c) => c.autoWire(token as { new (...args: any[]): T })),
      singleton: false,
    });
  }

  registerSingleton<T>(token: Token<T>, factory?: FactoryFn<T> | T): void {
    if (factory !== undefined && typeof factory !== 'function') {
      this.registry.set(token, { factory: () => factory as T, singleton: true, instance: factory as T });
      return;
    }
    this.registry.set(token, {
      factory: (factory as FactoryFn<T>) || ((c) => c.autoWire(token as { new (...args: any[]): T })),
      singleton: true,
    });
  }

  registerInstance<T>(token: Token<T>, instance: T): void {
    this.registry.set(token, { factory: () => instance, singleton: true, instance });
  }

  resolve<T>(token: Token<T>): T {
    const reg = this.registry.get(token);
    if (!reg) {
      if (typeof token === 'function') return this.autoWire(token);
      throw new Error(`No registration for token: ${token}`);
    }
    if (reg.singleton && reg.instance !== undefined) return reg.instance;
    if (this.resolving.has(token)) throw new Error(`Circular dependency detected: ${token}`);
    this.resolving.add(token);
    try {
      const instance = reg.factory(this);
      if (reg.singleton) reg.instance = instance;
      return instance;
    } finally {
      this.resolving.delete(token);
    }
  }

  has(token: Token): boolean {
    return this.registry.has(token);
  }

  clear(): void {
    this.registry.clear();
  }

  private autoWire<T>(ctor: { new (...args: any[]): T }): T {
    const paramTypes: any[] = (Reflect as any)?.getMetadata?.('design:paramtypes', ctor) || [];
    const params = paramTypes.map((p: any) => {
      if (!this.registry.has(p) && !this.resolving.has(p)) {
        if (typeof p === 'function' && p.name && p.name !== 'Object') return this.autoWire(p);
      }
      return this.resolve(p);
    });
    return new ctor(...params);
  }
}
