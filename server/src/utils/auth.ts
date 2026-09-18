import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export const SESSION_COOKIE_NAME = 'toktickit_session';

const SALT_ROUNDS = 10;
const TOKEN_LIFETIME_SECONDS = 8 * 60 * 60; // 8 hours (api-spec.md §0.1 "Token Lifetime")

export type UserRole = 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR';

export interface SessionTokenPayload {
  userId: number;
  email: string;
  role: UserRole;
  mustChangePassword: boolean;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_LIFETIME_SECONDS });
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded !== 'object' || decoded === null) {
      return null;
    }
    return decoded as unknown as SessionTokenPayload;
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: TOKEN_LIFETIME_SECONDS * 1000,
  };
}

// BR-07: at least 8 characters, one uppercase, one lowercase, one number, one special character.
const PASSWORD_RULES: Array<{ test: (pw: string) => boolean; message: string }> = [
  { test: (pw) => pw.length >= 8, message: 'Password must be at least 8 characters.' },
  { test: (pw) => /[A-Z]/.test(pw), message: 'Password must include an uppercase letter.' },
  { test: (pw) => /[a-z]/.test(pw), message: 'Password must include a lowercase letter.' },
  { test: (pw) => /[0-9]/.test(pw), message: 'Password must include a number.' },
  { test: (pw) => /[^A-Za-z0-9]/.test(pw), message: 'Password must include a special character.' },
];

export function validatePasswordComplexity(password: unknown): { isValid: boolean; error?: string } {
  if (typeof password !== 'string' || password.length === 0) {
    return { isValid: false, error: 'Password is required.' };
  }
  for (const rule of PASSWORD_RULES) {
    if (!rule.test(password)) {
      return { isValid: false, error: rule.message };
    }
  }
  return { isValid: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: unknown): email is string {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}
