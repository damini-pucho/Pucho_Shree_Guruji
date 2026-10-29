import { verify } from '@node-rs/argon2';
import { route, body, ApiError } from '@/lib/http';
import { audit, currentToken, hashPassword, requireUser, revokeSessions } from '@/lib/auth';
import { one, q } from '@/lib/db';
import { passwordChange } from '@/lib/validate';

export const POST = route(async req => {
  const u = await requireUser({ allowMustChange: true });
  const { current, next } = passwordChange.parse(await body(req));
  const row = await one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [u.id]);
  if (!row || !(await verify(row.password_hash, current).catch(() => false))) {
    throw new ApiError(400, 'Current password is incorrect', { current: 'Current password is incorrect' });
  }
  await q('UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2', [await hashPassword(next), u.id]);
  await revokeSessions(u.id, await currentToken()); // sign out every other device
  await audit(u.id, 'user.password_changed', 'user', u.id);
  return { ok: true };
});
