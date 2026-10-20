/**
 * admin/db/users.ts — User CRUD operations via DatabaseAdapter async methods.
 * SA4E-50: All functions are async and use getDbAdapter() so they work with
 * both SQLite (sync-under-the-hood) and PostgreSQL.
 * BR-18 facade — reads live in ./users/user-queries.ts, writes in ./users/user-mutations.ts.
 */

export {
  getUsers,
  getUserById,
  getUserByUsername,
  getUserCount,
  getUserCountByGroup,
} from './users/user-queries.js';

export {
  createUser,
  updateUserStatus,
  deleteUser,
  resetUserPassword,
  changePassword,
  updateLastLogin,
  updateUserEmail,
  updateUser,
} from './users/user-mutations.js';
