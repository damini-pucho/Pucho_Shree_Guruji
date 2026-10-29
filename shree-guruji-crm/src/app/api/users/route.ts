import { route, body, ApiError } from '@/lib/http';
import { audit, hashPassword, requireAdmin } from '@/lib/auth';
import { one, q } from '@/lib/db';
import { userCreate } from '@/lib/validate';

export const GET = route(async () => {
  await requireAdmin();
  return q(`
    SELECT u.id, u.name, u.email, u.role_id, r.name AS role_name, r.short_name AS role_short, r.description AS handles,
           u.is_active, u.must_change_password, u.last_login_at, u.created_at,
           (SELECT count(*) FROM leads l WHERE l.assigned_to = u.id AND l.stage IN ('Open','In Progress'))::int AS open_items
      FROM users u JOIN roles r ON r.id = u.role_id
     ORDER BY u.is_active DESC, r.sort, u.name`);
});

// An administrator adds a person with a temporary password; they must set their own at first sign-in.
export const POST = route(async req => {
  const admin = await requireAdmin();
  const v = userCreate.parse(await body(req));
  const exists = await one('SELECT 1 FROM users WHERE lower(email) = lower($1)', [v.email]);
  if (exists) throw new ApiError(409, 'Someone already uses this email', { email: 'Already in use' });
  const row = await one(
    `INSERT INTO users (name, email, role_id, password_hash, must_change_password) VALUES ($1,$2,$3,$4,true) RETURNING id`,
    [v.name, v.email.toLowerCase(), v.role_id, await hashPassword(v.password)]);
  await audit(admin.id, 'user.create', 'user', row.id, { email: v.email, role: v.role_id });
  return { id: row.id };
});
