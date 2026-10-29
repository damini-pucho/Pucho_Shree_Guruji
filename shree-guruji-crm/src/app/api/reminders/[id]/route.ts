import { route, body, intId, notFound } from '@/lib/http';
import { requireUser, SessionUser } from '@/lib/auth';
import { one, q } from '@/lib/db';
import { reminderPatch } from '@/lib/validate';

// A reminder belongs to its owner; an admin can manage anyone's.
async function owned(u: SessionUser, id: number) {
  const r = await one('SELECT id, user_id, created_by FROM reminders WHERE id = $1', [id]);
  if (!r || (u.role_id !== 'admin' && r.user_id !== u.id)) throw notFound('Reminder');
  return r;
}

export const PATCH = route(async (req, ctx) => {
  const u = await requireUser();
  const id = intId((await ctx.params).id);
  await owned(u, id);
  const { done } = reminderPatch.parse(await body(req));
  await q('UPDATE reminders SET done = $1, done_at = CASE WHEN $1 THEN now() ELSE NULL END WHERE id = $2', [done, id]);
  return { ok: true };
});

export const DELETE = route(async (_req, ctx) => {
  const u = await requireUser();
  const id = intId((await ctx.params).id);
  await owned(u, id);
  await q('DELETE FROM reminders WHERE id = $1', [id]);
  return { ok: true };
});
