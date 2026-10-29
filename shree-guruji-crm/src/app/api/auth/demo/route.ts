import { z } from 'zod';
import { route, body, forbidden, notFound } from '@/lib/http';
import { audit, createSession, demoLoginsEnabled } from '@/lib/auth';
import { one } from '@/lib/db';

// Persona sign-in for demos. Closed unless DEMO_LOGINS=true on a *_dev / *_demo database.
export const POST = route(async req => {
  if (!demoLoginsEnabled()) throw forbidden('Demo sign-in is switched off');
  const { user_id } = z.object({ user_id: z.number().int().positive() }).strict().parse(await body(req));
  const u = await one<{ id: number }>('SELECT id FROM users WHERE id = $1 AND is_active', [user_id]);
  if (!u) throw notFound('Person');
  await createSession(u.id);
  await audit(u.id, 'auth.demo_sign_in', 'user', u.id);
  return { ok: true };
});
