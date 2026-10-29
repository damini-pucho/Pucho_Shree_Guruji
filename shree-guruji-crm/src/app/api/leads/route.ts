import { route, body, bad } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { createLead, listLeads } from '@/lib/leads';
import { leadCreate, dateStr } from '@/lib/validate';

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

export const GET = route(async req => {
  const u = await requireUser();
  const s = new URL(req.url).searchParams;
  const k = s.get('kind');
  const kind = k === 'complaint' ? 'complaint' : k === 'any' ? 'any' : 'lead';
  const from = s.get('from') || undefined, to = s.get('to') || undefined;
  if (from && !dateStr.safeParse(from).success) throw bad('Use a valid from date');
  if (to && !dateStr.safeParse(to).success) throw bad('Use a valid to date');
  return listLeads(u, {
    kind, q: s.get('q') || undefined, seg: s.get('seg') || undefined,
    source_id: num(s.get('source')), type_id: num(s.get('type')), purpose_id: num(s.get('purpose')), city_id: num(s.get('city')),
    assigned: s.get('assigned') || undefined, from, to,
    view: s.get('view') === 'board' ? 'board' : 'table', page: num(s.get('page')), size: num(s.get('size')),
  });
});

export const POST = route(async req => {
  const u = await requireUser();
  const input = leadCreate.parse(await body(req));
  return createLead(u, input);
});
