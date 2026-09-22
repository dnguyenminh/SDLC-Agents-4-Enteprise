User Guide - SA4E-269 [Backend] Hợp nhất 2 auth entry về single UserRepository

## Overview
SA4E-269 unifies two parallel auth code paths into a single UserRepository, ensuring email-primary identity resolution with username fallback, and shared session lifecycle.

## UserRepository API
**Class:** `backend/src/database/repositories/UserRepository.ts`

### Methods
- `findByEmail(email: string): Promise<UserRow|null>` — lookup by email
- `findByUsername(username: string): Promise<UserRow|null>` — lookup by username
- `findById(userId: string): Promise<UserRow|null>` — lookup by id
- `createUser({ email, username?, passwordHash, accountType }): Promise<UserRow>` — inserts user with account_type, defaults to LOCAL
- `verifyCredentials(identifier, password): Promise<UserRow|null>` — resolves identifier (email primary, username fallback) and verifies PBKDF2 password

### Usage Example
```ts
const repo = new UserRepository(adapter);
const user = await repo.verifyCredentials('user@example.com', 'password');
if (!user) throw new Error('Invalid credentials');
const session = await sessionService.issue(user.user_id);
```

## Configuration
- Account type values: `LOCAL` | `SSO`
- Password hashing: PBKDF2 via `hashPassword` / `verifyPassword`

## Tests
Run unit tests:
```bash
npm test -- src/database/repositories/__tests__/UserRepository.test.ts
```
12 tests covering find, create with accountType, verifyCredentials paths.

## Acceptance
- Single UserRepository is sole source of truth for users
- accountType insertion enforced on createUser
- Backward compatible login via email or username
