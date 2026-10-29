import { route, body, intId, notFound, bad, ApiError } from '@/lib/http';
import { audit, requireAdmin } from '@/lib/auth';
import { one, q } from '@/lib/db';
import { setupPatch } from '@/lib/validate';
import { TABLE, kindOf } from '@/lib/setup';

const FK: Record<string, string> = { sources: 'source_id', types: 'type_id', purposes: 'purpose_id', cities: 'city_id' };

export const PATCH = route(async (req, ctx) => {
  const u = await requireAdmin();
  const p = await ctx.params;
  const kind = kindOf(p.kind), id = intId(p.id);
  const v = setupPatch.parse(await body(req));
  if (kind === 'types' && v.default_role) {
    const r = await one('UPDATE lead_types SET default_role = $1 WHERE id = $2 RETURNING *', [v.default_role, id]);
    if (!r) throw notFound('Lead type');
    await audit(u.id, 'setup.route', kind, id, { default_role: v.default_role });
    return r;
  }
  if (kind === 'purposes' && v.category) {
    const cur = await one('SELECT id, category, (SELECT count(*) FROM leads WHERE purpose_id = $1)::int AS used FROM lead_purposes WHERE id = $1', [id]);
    if (!cur) throw notFound('Purpose');
    // Moving a purpose in or out of "complaint" would move existing records between the lists.
    if (cur.used && (cur.category === 'complaint') !== (v.category === 'complaint')) {
      throw bad('This purpose is used by existing records, so it cannot move between leads and complaints');
    }
    const r = await one('UPDATE lead_purposes SET category = $1 WHERE id = $2 RETURNING *', [v.category, id]);
    await audit(u.id, 'setup.category', kind, id, { category: v.category });
    return r;
  }
  throw bad('Nothing to update for this list');
});

export const DELETE = route(async (_req, ctx) => {
  const u = await requireAdmin();
  const p = await ctx.params;
  const kind = kindOf(p.kind), id = intId(p.id);
  const row = await one(`SELECT id, label FROM ${TABLE[kind]} WHERE id = $1`, [id]);
  if (!row) throw notFound('Value');
  const used = await one<{ n: number }>(`SELECT count(*)::int AS n FROM leads WHERE ${FK[kind]} = $1`, [id]);
  if (used && used.n > 0) throw new ApiError(409, `“${row.label}” is used by ${used.n} existing record${used.n > 1 ? 's' : ''}, so it stays`);
  if (kind !== 'cities') {
    const left = await one<{ n: number }>(`SELECT count(*)::int AS n FROM ${TABLE[kind]}`);
    if (left && left.n <= 1) throw bad('Keep at least one value on this list');
  }
  await q(`DELETE FROM ${TABLE[kind]} WHERE id = $1`, [id]);
  await audit(u.id, 'setup.remove', kind, id, { label: row.label });
  return { ok: true };
});
