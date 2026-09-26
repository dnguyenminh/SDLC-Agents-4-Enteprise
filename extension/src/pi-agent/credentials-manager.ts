export interface CredentialRef {
  credentialKey: string;
  credentialValueRef: string;
}

export class CredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialsError';
  }
}

export class CredentialsManager {
  private store: Map<string, string>;

  constructor(initialStore?: Record<string, string>) {
    this.store = new Map(Object.entries(initialStore ?? {}));
  }

  private static validateRef(ref: string): void {
    // Must be reference, not secret. Simple heuristic: starts with env: or ref:
    if (!/^(env:|ref:)/.test(ref)) {
      throw new CredentialsError(`Credential value ref must be reference, not secret: ${ref}`);
    }
    // Detect likely secret pattern
    if (/^sk-[a-zA-Z0-9]{20,}$/.test(ref)) {
      throw new CredentialsError(`Credential value ref contains secret`);
    }
  }

  set(key: string, ref: string): void {
    CredentialsManager.validateRef(ref);
    this.store.set(key, ref);
  }

  resolve(cred: CredentialRef): string {
    const ref = cred.credentialValueRef;
    CredentialsManager.validateRef(ref);
    if (ref.startsWith('env:')) {
      const envKey = ref.slice(4);
      const val = process.env[envKey];
      if (!val) {
        throw new CredentialsError(`Environment variable ${envKey} not found`);
      }
      return val;
    }
    // For ref: return stored reference if exists, else error
    if (this.store.has(cred.credentialKey)) {
      return this.store.get(cred.credentialKey)!;
    }
    // If key not found in store, treat as missing credential
    if (!cred.credentialKey) {
      throw new CredentialsError(`Credential key '${cred.credentialKey}' not found`);
    }
    throw new CredentialsError(`Credential key '${cred.credentialKey}' not found`);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}
