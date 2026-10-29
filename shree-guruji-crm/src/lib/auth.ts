import 'server-only';
import crypto from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { hash, verify } from '@node-rs/argon2';
import { q, one, dbName } from './db';
import { ApiError, forbidden } from './http';

export type SessionUser = {
  id: number; name: string; email: string; role_id: string; role_name: string; role_short: string;
  must_change_password: boolean;
};

const SESSION_DAYS = 7;
const secureCookie = () => (process.env.APP_ORIGIN || '').startsWith('https://');
export const COOKIE = () => (secureCookie() ? '__Host-session' : 'sg_session');

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const hashPassword = (p: string) => hash(p);

// A fixed hash so a sign-in for an unknown email costs the same time as a real one.
let DUMMY: string | null = null;
async function dummyHash() { return DUMMY ??= await hash('not-a-real-password-' + crypto.randomUUID()); }

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  await q(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, SESSION_DAYS]);
  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
  await q('DELETE FROM sessions WHERE expires_at < now()');
  (await cookies()).set(COOKIE(), token, {
    httpOnly: true, secure: secureCookie(), sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const t = jar.get(COOKIE())?.value;
  if (t) await q('DELETE FROM sessions WHERE token_hash = $1', [sha256(t)]);
  jar.delete(COOKIE());
}

export const revokeSessions = (userId: number, exceptToken?: string) =>
  exceptToken
    ? q('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, sha256(exceptToken)])
    : q('DELETE FROM sessions WHERE user_id = $1', [userId]);

export const currentToken = async () => (await cookies()).get(COOKIE())?.value;

export const getUser = cache(async (): Promise<SessionUser | null> => {
  const t = (await cookies()).get(COOKIE())?.value;
  if (!t) return null;
  return one<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role_id, r.name AS role_name, r.short_name AS role_short, u.must_change_password
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`, [sha256(t)]);
});

export async function requireUser(opts: { allowMustChange?: boolean } = {}) {
  const u = await getUser();
  if (!u) throw new ApiError(401, 'Please sign in');
  if (u.must_change_password && !opts.allowMustChange) throw forbidden('Set a new password on Profile & settings first');
  return u;
}

export async function requireAdmin() {
  const u = await requireUser();
  if (u.role_id !== 'admin') throw forbidden('Only an administrator can do this');
  return u;
}

const MAX_FAILS = 5, WINDOW_MIN = 15;

export async function signIn(email: string, password: string) {
  const e = email.trim().toLowerCase();
  const fails = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM login_attempts WHERE lower(email) = $1 AND NOT ok AND at > now() - make_interval(mins => $2)`, [e, WINDOW_MIN]);
  if ((fails?.n ?? 0) >= MAX_FAILS) throw new ApiError(429, `Too many failed attempts. Try again in ${WINDOW_MIN} minutes.`);
  const u = await one<{ id: number; password_hash: string; is_active: boolean }>(
    'SELECT id, password_hash, is_active FROM users WHERE lower(email) = $1', [e]);
  const ok = u ? await verify(u.password_hash, password).catch(() => false) : (await verify(await dummyHash(), password).catch(() => false), false);
  await q('INSERT INTO login_attempts (email, ok) VALUES ($1, $2)', [e, !!(ok && u?.is_active)]);
  if (!u || !ok) throw new ApiError(401, 'Email or password is incorrect');
  if (!u.is_active) throw new ApiError(403, 'This account is deactivated. Ask an administrator.');
  await createSession(u.id);
  await audit(u.id, 'auth.sign_in', 'user', u.id);
}

// Persona sign-in without a password — local/demo databases only.
export const demoLoginsEnabled = () => process.env.DEMO_LOGINS === 'true' && /_(dev|demo)$/.test(dbName());

export async function audit(actorId: number | null, action: string, entity: string, entityId: number | string | null, detail: object = {}) {
  await q('INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)',
    [actorId, action, entity, entityId == null ? null : String(entityId), JSON.stringify(detail)]);
}
