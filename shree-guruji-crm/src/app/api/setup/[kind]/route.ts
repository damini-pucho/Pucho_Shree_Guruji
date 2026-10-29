import { route, body, ApiError } from '@/lib/http';
import { audit, requireAdmin } from '@/lib/auth';
import { one } from '@/lib/db';
import { setupCreate } from '@/lib/validate';
import { TABLE, kindOf } from '@/lib/setup';

export const POST = route(async (req, ctx) => {
  const u = await requireAdmin();
  const kind = kindOf((await ctx.params).kind);
  const v = setupCreate.parse(await body(req));
  const exists = await one(`SELECT 1 FROM ${TABLE[kind]} WHERE lower(label) = lower($1)`, [v.label]);
  if (exists) throw new ApiError(409, `“${v.label}” is already on the list`, { label: 'Already on the list' });
  const cols = ['label'], vals: unknown[] = [v.label];
  if (kind === 'types') { cols.push('default_role'); vals.push(v.default_role || 'cs'); }
  if (kind === 'purposes') { cols.push('category'); vals.push(v.category || 'other'); }
  if (kind === 'cities') { cols.push('state'); vals.push(v.state || ''); }
  if (kind !== 'cities') { cols.push('sort'); }
  const sortSql = kind !== 'cities' ? `, (SELECT COALESCE(max(sort), 0) + 1 FROM ${TABLE[kind]})` : '';
  const row = await one(
    `INSERT INTO ${TABLE[kind]} (${cols.join(', ')}) VALUES (${vals.map((_, i) => '$' + (i + 1)).join(', ')}${sortSql}) RETURNING *`, vals);
  await audit(u.id, 'setup.add', kind, row.id, { label: v.label });
  return row;
});
