import crypto from 'node:crypto';
import { route, body, ApiError, bad } from '@/lib/http';
import { one } from '@/lib/db';
import { inboundLead } from '@/lib/validate';
import { createLead } from '@/lib/leads';

// Machine-to-machine lead capture (website form today; the Phase 2 WhatsApp bot later).
// Authorization: Bearer <INBOUND_TOKEN>. Unset token = closed.
function authorised(req: Request) {
  const token = process.env.INBOUND_TOKEN;
  if (!token) return false;
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const byLabel = (table: string, label: string) => one<{ id: number }>(`SELECT id FROM ${table} WHERE lower(label) = lower($1)`, [label]);

export const POST = route(async req => {
  if (!process.env.INBOUND_TOKEN) throw new ApiError(403, 'Inbound capture is not enabled');
  if (!authorised(req)) throw new ApiError(401, 'Invalid token');
  const v = inboundLead.parse(await body(req));
  const [source, type, purpose, city] = await Promise.all([
    byLabel('lead_sources', v.source), byLabel('lead_types', v.type), byLabel('lead_purposes', v.purpose),
    v.city ? byLabel('cities', v.city) : Promise.resolve(null),
  ]);
  if (!source) throw bad(`Unknown source “${v.source}”`, { source: 'Not on the Setup list' });
  if (!type) throw bad(`Unknown lead type “${v.type}”`, { type: 'Not on the Setup list' });
  if (!purpose) throw bad(`Unknown purpose “${v.purpose}”`, { purpose: 'Not on the Setup list' });
  // An unknown city is kept in the details instead of creating a misspelt city.
  const details = v.city && !city ? `${v.details}${v.details ? '\n' : ''}City given: ${v.city}` : v.details;
  const created = await createLead(null, {
    name: v.name, phone: v.phone, email: v.email, city_id: city?.id ?? null, source_id: source.id, type_id: type.id,
    purpose_id: purpose.id, details: details.slice(0, 2000), remarks: '', allow_duplicate: false,
  });
  return created;
});
