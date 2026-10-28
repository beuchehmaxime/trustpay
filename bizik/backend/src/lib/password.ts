import bcrypt from 'bcryptjs';

import { config } from '../config/env';

/** Hash a plaintext password with bcrypt (SRS NFR-SEC-003, cost >= 12). */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

/** Constant-time compare of a plaintext password against a stored hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
