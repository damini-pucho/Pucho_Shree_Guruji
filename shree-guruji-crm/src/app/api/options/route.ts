import { route } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';

// Setup lists, roles and the people work can be assigned to — with usage counts for the Setup page.
export const GET = route(async () => {
  await requireUser();
  const [sources, types, purposes, cities, roles, users] = await Promise.all([
    q(`SELECT s.id, s.label, (SELECT count(*) FROM leads WHERE source_id = s.id)::int AS used FROM lead_sources s ORDER BY s.sort, s.id`),
    q(`SELECT t.id, t.label, t.default_role, (SELECT count(*) FROM leads WHERE type_id = t.id)::int AS used FROM lead_types t ORDER BY t.sort, t.id`),
    q(`SELECT p.id, p.label, p.category, (SELECT count(*) FROM leads WHERE purpose_id = p.id)::int AS used FROM lead_purposes p ORDER BY p.sort, p.id`),
    q(`SELECT c.id, c.label, c.state, (SELECT count(*) FROM leads WHERE city_id = c.id)::int AS used FROM cities c ORDER BY c.label`),
    q(`SELECT id, name, short_name, description FROM roles ORDER BY sort`),
    q(`SELECT u.id, u.name, u.role_id, r.short_name AS role_short FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.is_active ORDER BY r.sort, u.name`),
  ]);
  return { sources, types, purposes, cities, roles, users };
});
