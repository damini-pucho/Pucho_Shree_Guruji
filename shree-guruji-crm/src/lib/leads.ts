import 'server-only';
import { q, one, tx, Tx } from './db';
import { ApiError, bad, notFound } from './http';
import { todayIST } from './dates';
import { DONE_STAGES, OPEN_STAGES, Stage } from './access';
import type { SessionUser } from './auth';

type Params = unknown[];
const add = (P: Params, v: unknown) => { P.push(v); return '$' + P.length; };

// Row scope: an admin sees everything; anyone else sees what is assigned to them,
// plus their team's records that nobody has picked up yet.
export function scopeSql(u: Pick<SessionUser, 'id' | 'role_id'>, P: Params, alias = 'l') {
  if (u.role_id === 'admin') return 'TRUE';
  return `(${alias}.assigned_to = ${add(P, u.id)} OR (${alias}.assigned_to IS NULL AND ${alias}.team_id = ${add(P, u.role_id)}))`;
}

const SELECT = (P: Params) => `
  SELECT l.id, l.kind, l.name, l.phone, l.email, l.city_id, c.label AS city, l.source_id, s.label AS source,
         l.type_id, t.label AS type, l.purpose_id, p.label AS purpose, p.category AS purpose_category,
         l.details, l.stage, l.team_id, rt.short_name AS team, l.assigned_to, u.name AS assignee,
         l.received_on, l.resolved_on, l.remarks, l.customer_informed, l.created_at, l.updated_at,
         (COALESCE(l.resolved_on, ${add(P, todayIST())}::date) - l.received_on) AS age_days
    FROM leads l
    JOIN lead_sources s ON s.id = l.source_id
    JOIN lead_types t ON t.id = l.type_id
    JOIN lead_purposes p ON p.id = l.purpose_id
    JOIN roles rt ON rt.id = l.team_id
    LEFT JOIN cities c ON c.id = l.city_id
    LEFT JOIN users u ON u.id = l.assigned_to`;

export const SEGMENTS: Record<string, string> = {
  all: 'TRUE',
  active: `l.stage IN ('Open','In Progress')`,
  Open: `l.stage = 'Open'`,
  'In Progress': `l.stage = 'In Progress'`,
  Closed: `l.stage = 'Closed'`,
  Rejected: `l.stage = 'Rejected'`,
  Converted: `l.stage = 'Converted'`,
  attn: `l.kind = 'complaint' AND l.stage = 'Closed' AND NOT l.customer_informed`,
};

export type LeadFilters = {
  kind: 'lead' | 'complaint' | 'any'; q?: string; seg?: string; source_id?: number; type_id?: number; purpose_id?: number;
  city_id?: number; assigned?: string; from?: string; to?: string; view?: 'table' | 'board'; page?: number; size?: number;
};

export async function listLeads(u: SessionUser, f: LeadFilters) {
  const P: Params = [];
  const where = [f.kind === 'any' ? 'TRUE' : `l.kind = ${add(P, f.kind)}`, scopeSql(u, P)];
  if (f.q) {
    const term = f.q.trim().slice(0, 100);
    const digits = term.replace(/\D/g, '');
    const like = add(P, `%${term.replace(/[\\%_]/g, m => '\\' + m)}%`);
    const parts = [`l.name ILIKE ${like}`, `c.label ILIKE ${like}`, `l.details ILIKE ${like}`, `l.remarks ILIKE ${like}`,
      `p.label ILIKE ${like}`, `l.email ILIKE ${like}`, `u.name ILIKE ${like}`];
    if (digits.length >= 3) parts.push(`l.phone LIKE ${add(P, `%${digits}%`)}`);
    where.push(`(${parts.join(' OR ')})`);
  }
  if (f.source_id) where.push(`l.source_id = ${add(P, f.source_id)}`);
  if (f.type_id) where.push(`l.type_id = ${add(P, f.type_id)}`);
  if (f.purpose_id) where.push(`l.purpose_id = ${add(P, f.purpose_id)}`);
  if (f.city_id) where.push(`l.city_id = ${add(P, f.city_id)}`);
  if (f.assigned === 'me') where.push(`l.assigned_to = ${add(P, u.id)}`);
  else if (f.assigned === 'none') where.push('l.assigned_to IS NULL');
  else if (f.assigned && /^\d+$/.test(f.assigned)) where.push(`l.assigned_to = ${add(P, Number(f.assigned))}`);
  if (f.from) where.push(`l.received_on >= ${add(P, f.from)}::date`);
  if (f.to) where.push(`l.received_on <= ${add(P, f.to)}::date`);

  const base = SELECT(P) + ' WHERE ' + where.join(' AND ');
  const counts = await one<Record<string, number>>(
    `SELECT ${Object.entries(SEGMENTS).map(([k, s]) => `count(*) FILTER (WHERE ${s})::int AS "${k}"`).join(', ')}
       FROM (${base}) x JOIN leads l ON l.id = x.id`, P);

  const seg = f.seg && SEGMENTS[f.seg] ? f.seg : 'all';
  const segWhere = ` AND ${SEGMENTS[seg]}`;
  if (f.view === 'board') {
    const rows = await q(`${base}${segWhere} ORDER BY l.received_on DESC, l.id DESC LIMIT 500`, P);
    return { rows, total: rows.length, counts, page: 1, size: rows.length };
  }
  const size = Math.min(Math.max(f.size || 25, 5), 100);
  const total = counts?.[seg] ?? 0;
  const page = Math.min(Math.max(f.page || 1, 1), Math.max(1, Math.ceil(total / size)));
  const rows = await q(`${base}${segWhere} ORDER BY l.received_on DESC, l.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, P);
  return { rows, total, counts, page, size };
}

export async function getLead(u: SessionUser, id: number, c?: Tx) {
  const P: Params = [];
  const sql = `${SELECT(P)} WHERE l.id = ${add(P, id)} AND ${scopeSql(u, P)}`;
  const row = c ? (await c.query(sql, P)).rows[0] : await one(sql, P);
  if (!row) throw notFound('Enquiry');
  return row;
}

export async function getLeadDetail(u: SessionUser, id: number) {
  const lead = await getLead(u, id);
  const [activity, reminders] = await Promise.all([
    q(`SELECT a.id, a.type, a.message, a.created_at, us.name AS user_name
         FROM activities a LEFT JOIN users us ON us.id = a.user_id WHERE a.lead_id = $1 ORDER BY a.created_at DESC, a.id DESC`, [id]),
    q(`SELECT r.id, r.title, r.due_date, to_char(r.due_time, 'HH24:MI') AS due_time, r.done, us.name AS user_name
         FROM reminders r JOIN users us ON us.id = r.user_id
        WHERE r.lead_id = $1 AND NOT r.done ORDER BY r.due_date, r.due_time NULLS LAST`, [id]),
  ]);
  return { lead, activity, reminders };
}

const log = (c: Tx, leadId: number, userId: number | null, type: string, message: string) =>
  c.query('INSERT INTO activities (lead_id, user_id, type, message) VALUES ($1,$2,$3,$4)', [leadId, userId, type, message]);

async function lookup(c: Tx, table: 'lead_sources' | 'lead_types' | 'lead_purposes' | 'cities', id: number, field: string) {
  const r = (await c.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0];
  if (!r) throw bad('Pick a value from the list', { [field]: 'Pick a value from the list' });
  return r;
}

async function activeUser(c: Tx, id: number) {
  const r = (await c.query('SELECT id, name, role_id FROM users WHERE id = $1 AND is_active', [id])).rows[0];
  if (!r) throw bad('Pick an active person', { assigned_to: 'Pick an active person' });
  return r as { id: number; name: string; role_id: string };
}

// Routing rule (shown on the Setup page): complaints → CS, job purposes → HR, otherwise the lead type's team.
export const routeTeam = (purposeCategory: string, typeDefaultRole: string) =>
  purposeCategory === 'complaint' ? 'cs' : purposeCategory === 'job' ? 'hr' : typeDefaultRole;

// The team member with the fewest open items gets the new record.
async function leastLoaded(c: Tx, team: string) {
  return (await c.query(
    `SELECT u.id, u.name, u.role_id FROM users u
       LEFT JOIN leads l ON l.assigned_to = u.id AND l.stage IN ('Open','In Progress')
      WHERE u.role_id = $1 AND u.is_active GROUP BY u.id ORDER BY count(l.id), u.id LIMIT 1`, [team])).rows[0] ?? null;
}

export type LeadInput = {
  name: string; phone: string; email: string; city_id?: number | null; source_id: number; type_id: number; purpose_id: number;
  details: string; received_on?: string; assigned_to?: number | null; remarks: string; allow_duplicate?: boolean;
};

export async function createLead(actor: SessionUser | null, input: LeadInput) {
  const today = todayIST();
  const received = input.received_on || today;
  if (received > today) throw bad('The received date cannot be in the future', { received_on: 'Cannot be in the future' });

  return tx(async c => {
    const source = await lookup(c, 'lead_sources', input.source_id, 'source_id');
    const type = await lookup(c, 'lead_types', input.type_id, 'type_id');
    const purpose = await lookup(c, 'lead_purposes', input.purpose_id, 'purpose_id');
    if (input.city_id) await lookup(c, 'cities', input.city_id, 'city_id');
    const kind = purpose.category === 'complaint' ? 'complaint' : 'lead';

    if (input.phone && !input.allow_duplicate) {
      const dup = (await c.query(
        `SELECT l.id, l.name, l.kind, u.name AS assignee FROM leads l LEFT JOIN users u ON u.id = l.assigned_to
          WHERE l.phone = $1 AND l.kind = $2 AND l.stage IN ('Open','In Progress') ORDER BY l.id DESC LIMIT 1`, [input.phone, kind])).rows[0];
      if (dup) {
        throw new ApiError(409, `An open ${dup.kind === 'complaint' ? 'complaint' : 'enquiry'} with this phone already exists: ${dup.name}${dup.assignee ? ` (with ${dup.assignee})` : ''}`,
          { phone: 'Already open for this number' }, { duplicate: { id: dup.id, name: dup.name } });
      }
    }

    let team = routeTeam(purpose.category, type.default_role);
    const assignee = input.assigned_to ? await activeUser(c, input.assigned_to) : input.assigned_to === null ? null : await leastLoaded(c, team);
    if (assignee && assignee.role_id !== 'admin') team = assignee.role_id;

    const r = (await c.query(
      `INSERT INTO leads (kind, name, phone, email, city_id, source_id, type_id, purpose_id, details, stage, team_id, assigned_to,
                          received_on, remarks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Open',$10,$11,$12,$13,$14) RETURNING id`,
      [kind, input.name, input.phone, input.email, input.city_id ?? null, source.id, type.id, purpose.id, input.details,
        team, assignee?.id ?? null, received, input.remarks, actor?.id ?? null])).rows[0];
    await log(c, r.id, actor?.id ?? null, 'created', `Enquiry received via ${source.label}`);
    await log(c, r.id, actor?.id ?? null, 'assign', assignee ? `Assigned to ${assignee.name}` : `Waiting in the ${team.toUpperCase()} team queue (nobody active to assign)`);
    if (input.remarks) await log(c, r.id, actor?.id ?? null, 'update', `Remarks: ${input.remarks}`);
    return { id: r.id as number, kind };
  });
}

export type LeadPatch = Partial<{
  name: string; phone: string; email: string; city_id: number | null; source_id: number; type_id: number; purpose_id: number;
  details: string; stage: Stage; assigned_to: number | null; received_on: string; resolved_on: string | null; remarks: string;
  customer_informed: boolean;
}>;

const fmt = (s: string) => new Date(s + 'T00:00:00Z').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });

export async function updateLead(u: SessionUser, id: number, patch: LeadPatch) {
  const today = todayIST();
  return tx(async c => {
    await c.query('SELECT id FROM leads WHERE id = $1 FOR UPDATE', [id]);
    const cur = await getLead(u, id, c);
    const set: Record<string, unknown> = {};
    const msgs: [string, string][] = [];

    // Detail edits
    if (patch.name !== undefined && patch.name !== cur.name) { set.name = patch.name; msgs.push(['update', `Name changed to ${patch.name}`]); }
    if (patch.phone !== undefined && patch.phone !== cur.phone) { set.phone = patch.phone; msgs.push(['update', `Phone changed to ${patch.phone || '—'}`]); }
    if (patch.email !== undefined && patch.email !== cur.email) { set.email = patch.email; msgs.push(['update', `Email changed to ${patch.email || '—'}`]); }
    if (patch.details !== undefined && patch.details !== cur.details) { set.details = patch.details; msgs.push(['update', 'Enquiry details edited']); }
    if (patch.city_id !== undefined && patch.city_id !== cur.city_id) {
      const city = patch.city_id ? await lookup(c, 'cities', patch.city_id, 'city_id') : null;
      set.city_id = patch.city_id; msgs.push(['update', `City set to ${city?.label ?? '—'}`]);
    }
    if (patch.source_id !== undefined && patch.source_id !== cur.source_id) {
      const s = await lookup(c, 'lead_sources', patch.source_id, 'source_id'); set.source_id = s.id; msgs.push(['update', `Source set to ${s.label}`]);
    }
    if (patch.type_id !== undefined && patch.type_id !== cur.type_id) {
      const t = await lookup(c, 'lead_types', patch.type_id, 'type_id'); set.type_id = t.id; msgs.push(['update', `Lead type set to ${t.label}`]);
    }
    let kind = cur.kind;
    if (patch.purpose_id !== undefined && patch.purpose_id !== cur.purpose_id) {
      const p = await lookup(c, 'lead_purposes', patch.purpose_id, 'purpose_id');
      kind = p.category === 'complaint' ? 'complaint' : 'lead';
      set.purpose_id = p.id; if (kind !== cur.kind) set.kind = kind;
      msgs.push(['update', `Purpose set to ${p.label}`]);
    }

    // Stage and dates
    let stage: Stage = cur.stage;
    if (patch.stage !== undefined && patch.stage !== cur.stage) { stage = patch.stage; set.stage = stage; }
    if (kind === 'complaint' && stage === 'Converted') throw bad('A complaint is closed or rejected, not converted', { stage: 'Pick Closed or Rejected' });

    let received: string = cur.received_on;
    if (patch.received_on !== undefined && patch.received_on !== cur.received_on) {
      if (patch.received_on > today) throw bad('The received date cannot be in the future', { received_on: 'Cannot be in the future' });
      received = patch.received_on; set.received_on = received; msgs.push(['update', `Received date set to ${fmt(received)}`]);
    }
    let resolved: string | null = cur.resolved_on;
    const done = DONE_STAGES.includes(stage);
    if (patch.resolved_on !== undefined) {
      if (patch.resolved_on && !done) throw bad('Set the stage to Closed, Rejected or Converted first', { resolved_on: 'Only for closed records' });
      if (!patch.resolved_on && done) throw bad('A closed record needs a resolution date', { resolved_on: 'Required when closed' });
      if (patch.resolved_on && patch.resolved_on > today) throw bad('The resolution date cannot be in the future', { resolved_on: 'Cannot be in the future' });
      if (patch.resolved_on !== cur.resolved_on) { resolved = patch.resolved_on; if (resolved) msgs.push(['update', `Resolution date set to ${fmt(resolved)}`]); }
    }
    if (done && !resolved) resolved = today;
    if (!done) resolved = null;
    if (resolved && resolved < received) {
      if (patch.resolved_on) throw bad('The resolution date cannot be before the received date', { resolved_on: 'Before the received date' });
      resolved = received;
    }
    if (resolved !== cur.resolved_on) set.resolved_on = resolved;
    if (set.stage) msgs.push(['stage', stage === 'Converted' ? 'Lead converted' : `Stage changed to ${stage}`]);

    if (patch.remarks !== undefined && patch.remarks !== cur.remarks) { set.remarks = patch.remarks; msgs.push(['update', `Remarks: ${patch.remarks || 'cleared'}`]); }
    if (patch.customer_informed !== undefined && patch.customer_informed !== cur.customer_informed) {
      if (kind !== 'complaint') throw bad('Only complaints track whether the customer was told');
      set.customer_informed = patch.customer_informed;
      msgs.push(['informed', patch.customer_informed ? 'Marked: customer told' : 'Unmarked: customer told']);
    }

    // Assignment
    if (patch.assigned_to !== undefined && patch.assigned_to !== cur.assigned_to) {
      if (patch.assigned_to === null) {
        set.assigned_to = null; msgs.push(['assign', `Unassigned — back in the ${cur.team} queue`]);
      } else {
        const a = await activeUser(c, patch.assigned_to);
        set.assigned_to = a.id;
        if (a.role_id !== 'admin') set.team_id = a.role_id;
        msgs.push(['assign', `Assigned to ${a.name}`]);
      }
    }

    const keys = Object.keys(set);
    if (keys.length) {
      const P: Params = [];
      await c.query(`UPDATE leads SET ${keys.map(k => `${k} = ${add(P, set[k])}`).join(', ')}, updated_at = now() WHERE id = ${add(P, id)}`, P);
      for (const [type, m] of msgs) await log(c, id, u.id, type, m);
    }
    const P2: Params = [];
    const visible = !!(await c.query(`SELECT 1 FROM leads l WHERE l.id = ${add(P2, id)} AND ${scopeSql(u, P2)}`, P2)).rowCount;
    return { changed: keys.length > 0, visible, lead: visible ? await getLead(u, id, c) : null };
  });
}

export async function addActivity(u: SessionUser, id: number, type: 'note' | 'call' | 'whatsapp', message: string) {
  await getLead(u, id);
  return tx(c => log(c, id, u.id, type, message));
}

export async function dashboard(u: SessionUser) {
  const P: Params = [];
  const scope = scopeSql(u, P);
  const k = await one(`
    SELECT count(*) FILTER (WHERE l.kind = 'lead' AND l.stage IN ('Open','In Progress'))::int AS open_leads,
           count(*) FILTER (WHERE l.kind = 'lead' AND l.stage = 'Converted')::int AS converted,
           count(*) FILTER (WHERE l.kind = 'lead' AND p.category = 'sales')::int AS sales_total,
           count(*) FILTER (WHERE l.kind = 'lead' AND p.category = 'sales' AND l.stage = 'Converted')::int AS sales_converted,
           count(*) FILTER (WHERE l.kind = 'complaint' AND l.stage IN ('Open','In Progress'))::int AS open_complaints,
           count(*) FILTER (WHERE ${SEGMENTS.attn})::int AS not_told,
           count(*)::int AS total,
           count(*) FILTER (WHERE l.stage IN ('Open','In Progress'))::int AS open_all
      FROM leads l JOIN lead_purposes p ON p.id = l.purpose_id WHERE ${scope}`, P);
  const bySource = await q(`SELECT s.label, count(l.id)::int AS n FROM lead_sources s
      LEFT JOIN leads l ON l.source_id = s.id AND ${scope} GROUP BY s.id ORDER BY s.sort, s.id`, P);
  const byPurpose = await q(`SELECT p.label, count(l.id)::int AS n FROM lead_purposes p
      LEFT JOIN leads l ON l.purpose_id = p.id AND ${scope} GROUP BY p.id ORDER BY p.sort, p.id`, P);
  const byStage = await q(`SELECT l.stage AS label, count(*)::int AS n FROM leads l WHERE ${scope} GROUP BY l.stage`, P);
  const Q: Params = [];
  const queue = await q(`${SELECT(Q)} WHERE ${scopeSql(u, Q)} AND (l.stage = 'Open' OR ${SEGMENTS.attn})
      ORDER BY l.received_on ASC, l.id ASC LIMIT 6`, Q);
  return { kpis: k, bySource, byPurpose, byStage, queue };
}

// Counts for the navigation badges and the bell.
export async function navSummary(u: SessionUser) {
  const P: Params = [];
  const today = add(P, todayIST());
  const scope = scopeSql(u, P);
  const remScope = u.role_id === 'admin' ? 'TRUE' : `r.user_id = ${add(P, u.id)}`;
  return one(`
    SELECT (SELECT count(*) FROM leads l WHERE ${scope} AND l.kind = 'lead' AND l.stage IN ('Open','In Progress'))::int AS leads,
           (SELECT count(*) FROM leads l WHERE ${scope} AND l.kind = 'complaint' AND l.stage IN ('Open','In Progress'))::int AS complaints,
           (SELECT count(*) FROM leads l WHERE ${scope} AND ((l.kind = 'complaint' AND l.stage = 'Open') OR (${SEGMENTS.attn})))::int AS alerts,
           (SELECT count(*) FROM reminders r WHERE ${remScope} AND NOT r.done AND r.due_date = ${today}::date)::int AS reminders_today,
           (SELECT count(*) FROM reminders r WHERE ${remScope} AND NOT r.done AND r.due_date < ${today}::date)::int AS reminders_overdue`, P);
}

export { OPEN_STAGES };
