import { route, body, intId, notFound, bad } from '@/lib/http';
import { hashPassword, requireAdmin } from '@/lib/auth';
import { tx } from '@/lib/db';
import { userPatch } from '@/lib/validate';

export const PATCH = route(async (req, ctx) => {
  const admin = await requireAdmin();
  const id = intId((await ctx.params).id);
  const v = userPatch.parse(await body(req));

  return tx(async c => {
    const cur = (await c.query('SELECT id, name, role_id, is_active FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('Person');
    const self = id === admin.id;
    if (self && v.role_id !== undefined && v.role_id !== cur.role_id) throw bad('You cannot change your own role', { role_id: 'Not your own' });
    if (self && v.is_active === false) throw bad('You cannot deactivate yourself', { is_active: 'Not yourself' });

    const losesAdmin = cur.role_id === 'admin' && cur.is_active && (v.is_active === false || (v.role_id && v.role_id !== 'admin'));
    if (losesAdmin) {
      const n = (await c.query(`SELECT count(*)::int AS n FROM users WHERE role_id = 'admin' AND is_active`)).rows[0].n;
      if (n <= 1) throw bad('This is the last active administrator. Make someone else an admin first.');
    }

    const changes: string[] = [];
    let revoke = false;
    if (v.name !== undefined && v.name !== cur.name) {
      await c.query('UPDATE users SET name = $1, updated_at = now() WHERE id = $2', [v.name, id]); changes.push('name');
    }
    if (v.role_id !== undefined && v.role_id !== cur.role_id) {
      await c.query('UPDATE users SET role_id = $1, updated_at = now() WHERE id = $2', [v.role_id, id]);
      // Their open work moves with them to the new team.
      if (v.role_id !== 'admin') {
        await c.query(`UPDATE leads SET team_id = $1, updated_at = now() WHERE assigned_to = $2 AND stage IN ('Open','In Progress')`, [v.role_id, id]);
      }
      changes.push('role'); revoke = true;
    }
    if (v.is_active !== undefined && v.is_active !== cur.is_active) {
      await c.query('UPDATE users SET is_active = $1, updated_at = now() WHERE id = $2', [v.is_active, id]);
      if (!v.is_active) {
        // Open work goes back to the team queue so it is not stranded with an inactive person.
        const moved = (await c.query(
          `UPDATE leads SET assigned_to = NULL, updated_at = now() WHERE assigned_to = $1 AND stage IN ('Open','In Progress') RETURNING id`, [id])).rows;
        for (const l of moved) {
          await c.query(`INSERT INTO activities (lead_id, user_id, type, message) VALUES ($1,$2,'assign',$3)`,
            [l.id, admin.id, `${cur.name} was deactivated — back in the team queue`]);
        }
        revoke = true;
      }
      changes.push(v.is_active ? 'reactivated' : 'deactivated');
    }
    if (v.password !== undefined) {
      await c.query('UPDATE users SET password_hash = $1, must_change_password = true, updated_at = now() WHERE id = $2',
        [await hashPassword(v.password), id]);
      changes.push('password reset'); revoke = true;
    }
    if (revoke) await c.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    if (changes.length) {
      await c.query('INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)',
        [admin.id, 'user.update', 'user', String(id), JSON.stringify({ changes, role: v.role_id, is_active: v.is_active })]);
    }
    return { ok: true, changes };
  });
});
