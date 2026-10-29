import { route, body, bad } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { q, one, tx } from '@/lib/db';
import { dateStr, reminderCreate } from '@/lib/validate';
import { todayIST } from '@/lib/dates';
import { getLead } from '@/lib/leads';

// GET ?from=YYYY-MM-DD&to=YYYY-MM-DD  or  ?overdue=1   [&user=<id> for an admin]
export const GET = route(async req => {
  const u = await requireUser();
  const s = new URL(req.url).searchParams;
  const P: unknown[] = [];
  const where: string[] = [];
  if (u.role_id !== 'admin') { P.push(u.id); where.push(`r.user_id = $${P.length}`); }
  else if (s.get('user') && /^\d+$/.test(s.get('user')!)) { P.push(Number(s.get('user'))); where.push(`r.user_id = $${P.length}`); }
  P.push(todayIST()); const today = `$${P.length}::date`;
  if (s.get('overdue') === '1') where.push(`NOT r.done AND r.due_date < ${today}`);
  else {
    const from = dateStr.parse(s.get('from') || todayIST()), to = dateStr.parse(s.get('to') || from);
    if (to < from) throw bad('The end date is before the start date');
    P.push(from, to); where.push(`r.due_date BETWEEN $${P.length - 1}::date AND $${P.length}::date`);
  }
  const rows = await q(
    `SELECT r.id, r.title, r.due_date, to_char(r.due_time, 'HH24:MI') AS due_time, r.done, r.lead_id, r.user_id,
            l.name AS lead_name, l.kind AS lead_kind, us.name AS user_name, (NOT r.done AND r.due_date < ${today}) AS overdue
       FROM reminders r JOIN users us ON us.id = r.user_id LEFT JOIN leads l ON l.id = r.lead_id
      WHERE ${where.join(' AND ')} ORDER BY r.due_date, r.due_time NULLS LAST, r.id`, P);
  const P2: unknown[] = [todayIST()];
  const late = await one<{ n: number }>(
    `SELECT count(*)::int AS n FROM reminders r WHERE NOT r.done AND r.due_date < $1::date ${u.role_id === 'admin' ? '' : 'AND r.user_id = $2'}`,
    u.role_id === 'admin' ? P2 : [...P2, u.id]);
  return { rows, overdue: late?.n ?? 0 };
});

export const POST = route(async req => {
  const u = await requireUser();
  const input = reminderCreate.parse(await body(req));
  if (input.due_date < todayIST()) throw bad('Pick today or a later date', { due_date: 'Pick today or a later date' });
  let lead: any = null;
  if (input.lead_id) lead = await getLead(u, input.lead_id); // must be a record this person can see
  let owner = u.id;
  if (u.role_id === 'admin') {
    owner = input.user_id ?? u.id;
    // Linked to a lead and left on the admin: it goes to the lead's handler.
    if (lead && owner === u.id && lead.assigned_to) owner = lead.assigned_to;
    const ok = await one('SELECT 1 FROM users WHERE id = $1 AND is_active', [owner]);
    if (!ok) throw bad('Pick an active person', { user_id: 'Pick an active person' });
  } else if (input.user_id && input.user_id !== u.id) {
    throw bad('You can set reminders only for yourself', { user_id: 'Only for yourself' });
  }
  const time = input.due_time || null;
  return tx(async c => {
    const r = (await c.query(
      `INSERT INTO reminders (title, due_date, due_time, lead_id, user_id, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.title, input.due_date, time, lead?.id ?? null, owner, u.id])).rows[0];
    if (lead) {
      const d = new Date(input.due_date + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
      await c.query(`INSERT INTO activities (lead_id, user_id, type, message) VALUES ($1,$2,'reminder',$3)`,
        [lead.id, u.id, `Reminder set for ${d}: ${input.title}`]);
    }
    return { id: r.id, due_date: input.due_date, user_id: owner };
  });
});
