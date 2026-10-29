// End-to-end API test against a running server on a seeded *_dev database.
//   npm run db:reset && npm start   (another terminal)   then   npm run test:api
// It writes test records; run `npm run db:reset` afterwards for clean demo data.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const PW = process.env.DEMO_PASSWORD;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const shift = (s, n) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} ${extra}`); } };

function client() {
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(BASE + url, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual',
    });
    const sc = res.headers.get('set-cookie');
    if (sc) { const m = sc.match(/((?:__Host-session|sg_session)=[^;]*)/); if (m) cookie = m[1].endsWith('=') ? '' : m[1]; }
    let data = null; try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data };
  };
  return {
    get: u => call('GET', u), post: (u, b, h) => call('POST', u, b, h), patch: (u, b) => call('PATCH', u, b), del: u => call('DELETE', u),
    login: async email => (await call('POST', '/api/auth/login', { email, password: PW })).status,
  };
}

const admin = client(), ret = client(), cs = client(), anon = client();

console.log('\nAuth');
ok((await anon.get('/api/health')).data?.ok === true, 'health reports database up');
ok((await anon.get('/api/leads')).status === 401, 'signed-out request is refused (401)');
ok((await anon.post('/api/auth/login', { email: 'admin@shreeguruji.demo', password: 'wrong-pass1' })).status === 401, 'wrong password refused');
ok((await anon.post('/api/auth/login', { email: 'x' })).status === 400, 'malformed sign-in body refused (400)');
ok((await admin.login('admin@shreeguruji.demo')) === 200, 'admin signs in');
ok((await ret.login('ret@shreeguruji.demo')) === 200, 'retail sales signs in');
ok((await cs.login('cs@shreeguruji.demo')) === 200, 'CS signs in');
ok((await admin.post('/api/leads', { name: 'x' }, { Origin: 'https://evil.example' })).status === 403, 'cross-site write refused (403)');

const opt = (await admin.get('/api/options')).data;
const idOf = (list, label) => opt[list].find(x => x.label === label)?.id;
const userId = name => opt.users.find(u => u.name === name)?.id;

console.log('\nLeads — validation');
const base = { name: 'Test Kirana', phone: '98 7654 3210', source_id: idOf('sources', 'WhatsApp'), type_id: idOf('types', 'Retailer'),
  purpose_id: idOf('purposes', 'New Business Enquiry'), city_id: idOf('cities', 'Indore'), details: 'Wants rate card' };
let r = await admin.post('/api/leads', { ...base, name: '' });
ok(r.status === 400 && r.data.fields?.name, 'empty name → 400 with field error');
r = await admin.post('/api/leads', { ...base, phone: '12345' });
ok(r.status === 400 && r.data.fields?.phone, 'short phone → 400');
r = await admin.post('/api/leads', { ...base, received_on: shift(today, 2) });
ok(r.status === 400 && r.data.fields?.received_on, 'future received date → 400');
r = await admin.post('/api/leads', { ...base, source_id: 99999 });
ok(r.status === 400, 'unknown source → 400');
r = await admin.post('/api/leads', { ...base, hack: 1 });
ok(r.status === 400, 'unknown field → 400 (strict schema)');

console.log('\nLeads — create, auto-route, duplicates');
r = await admin.post('/api/leads', base);
ok(r.status === 200 && r.data.id, 'valid enquiry created');
const leadId = r.data.id;
let d = (await admin.get(`/api/leads/${leadId}`)).data;
ok(d.lead.team_id === 'ret' && d.lead.assignee === 'Retail Sales (demo)', 'Retailer enquiry auto-routed to Retail Sales');
ok(d.lead.phone === '9876543210' && d.lead.stage === 'Open', 'phone normalised, stage Open');
ok(d.activity.length >= 2, 'activity logged on create');
r = await admin.post('/api/leads', base);
ok(r.status === 409 && r.data.duplicate?.id === leadId, 'same phone while open → 409 duplicate warning');
r = await admin.post('/api/leads', { ...base, allow_duplicate: true, name: 'Test Kirana (2)' });
ok(r.status === 200, 'save anyway with allow_duplicate');
r = await admin.post('/api/leads', { ...base, phone: '9000000001', purpose_id: idOf('purposes', 'Complaint'), type_id: idOf('types', 'Consumer'), name: 'Test Complainant' });
const compId = r.data?.id;
ok(r.status === 200 && r.data.kind === 'complaint', 'complaint purpose → kind complaint');
d = (await admin.get(`/api/leads/${compId}`)).data;
ok(d.lead.team_id === 'cs', 'complaint routed to CS team');

console.log('\nStages and dates');
r = await admin.patch(`/api/leads/${leadId}`, { stage: 'Converted' });
ok(r.status === 200 && r.data.lead.resolved_on === today, 'Converted fills the resolution date');
r = await admin.patch(`/api/leads/${leadId}`, { stage: 'In Progress' });
ok(r.data.lead.resolved_on === null, 'back to In Progress clears resolution date');
r = await admin.patch(`/api/leads/${compId}`, { stage: 'Converted' });
ok(r.status === 400, 'complaint cannot be Converted');
r = await admin.patch(`/api/leads/${leadId}`, { stage: 'Bogus' });
ok(r.status === 400, 'unknown stage → 400');
r = await admin.patch(`/api/leads/${leadId}`, { resolved_on: today });
ok(r.status === 400, 'resolution date on an open lead → 400');
r = await admin.patch(`/api/leads/${compId}`, { stage: 'Closed' });
ok(r.data.lead.stage === 'Closed', 'complaint closed');
r = await admin.patch(`/api/leads/${compId}`, { resolved_on: shift(today, -400) });
ok(r.status === 400, 'resolution before received → 400');
r = await admin.patch(`/api/leads/${compId}`, { customer_informed: true });
ok(r.data.lead.customer_informed === true, 'customer told recorded');
r = await admin.patch(`/api/leads/${leadId}`, { customer_informed: true });
ok(r.status === 400, 'customer told only on complaints');
r = await admin.patch(`/api/leads/${leadId}`, { remarks: 'Called, sending MRP list', city_id: idOf('cities', 'Bhopal') });
ok(r.data.lead.remarks === 'Called, sending MRP list' && r.data.lead.city === 'Bhopal', 'remarks and city edited');
r = await admin.post(`/api/leads/${leadId}/activity`, { message: 'Spoke to owner' });
ok(r.status === 200, 'note saved');
r = await admin.post(`/api/leads/${leadId}/activity`, { channel: 'call' });
d = (await admin.get(`/api/leads/${leadId}`)).data;
ok(d.activity.some(a => a.message === 'Note: Spoke to owner') && d.activity.some(a => a.type === 'call'), 'note and call appear on the timeline');
ok((await admin.get('/api/leads/999999')).status === 404, 'missing record → 404');
ok((await admin.get('/api/leads/abc')).status === 404, 'non-numeric id → 404');

console.log('\nSearch and filters');
let L = (await admin.get('/api/leads?kind=lead&q=98765')).data;
ok(L.rows.some(x => x.id === leadId), 'search by phone digits');
L = (await admin.get('/api/leads?kind=lead&q=bhopal')).data;
ok(L.rows.length > 0 && L.rows.every(x => x.city === 'Bhopal' || /bhopal/i.test(x.details + x.remarks + x.name)), 'search by city');
L = (await admin.get(`/api/leads?kind=lead&city=${idOf('cities', 'Surat')}`)).data;
ok(L.rows.every(x => x.city === 'Surat'), 'city filter');
L = (await admin.get('/api/leads?kind=lead&seg=Converted')).data;
ok(L.rows.every(x => x.stage === 'Converted') && L.counts.all >= L.counts.Converted, 'stage segment + counts');
L = (await admin.get('/api/leads?kind=complaint&seg=attn')).data;
ok(L.rows.every(x => x.stage === 'Closed' && !x.customer_informed), '"customer not told" segment');
L = (await admin.get('/api/leads?kind=lead&size=5&page=2')).data;
ok(L.page === 2 && L.rows.length <= 5, 'pagination');
ok((await admin.get('/api/leads?kind=lead&from=2026-99-01')).status === 400, 'bad date filter → 400');

console.log('\nRole-based access');
L = (await ret.get('/api/leads?kind=lead&size=100')).data;
ok(L.rows.length > 0 && L.rows.every(x => x.team_id === 'ret'), 'Retail Sales sees only retail work');
ok((await ret.get('/api/leads?kind=complaint&size=100')).data.rows.length === 0, 'Retail Sales sees no CS complaints');
ok((await ret.get(`/api/leads/${compId}`)).status === 404, 'out-of-scope record → 404');
ok((await ret.patch(`/api/leads/${compId}`, { stage: 'Open' })).status === 404, 'out-of-scope update → 404');
ok((await ret.get('/api/users')).status === 403, 'non-admin cannot list users');
ok((await ret.post('/api/setup/sources', { label: 'Hack' })).status === 403, 'non-admin cannot edit setup');
r = await ret.patch(`/api/leads/${leadId}`, { assigned_to: userId('Distributor Sales (demo)') });
ok(r.status === 200 && r.data.visible === false, 'reassigning away removes it from the old handler’s view');
ok((await ret.get(`/api/leads/${leadId}`)).status === 404, 'and it is now out of their scope');
const dash = (await cs.get('/api/dashboard')).data;
ok(dash.kpis && Array.isArray(dash.bySource) && Array.isArray(dash.queue), 'dashboard loads for CS');

console.log('\nReminders');
r = await ret.post('/api/reminders', { title: 'Call back', due_date: shift(today, -1) });
ok(r.status === 400, 'past date → 400');
r = await ret.post('/api/reminders', { title: 'Call back', due_date: today, user_id: userId('CS Team (demo)') });
ok(r.status === 400, 'non-admin cannot set reminders for others');
r = await ret.post('/api/reminders', { title: 'Call back about rate card', due_date: today, due_time: '15:30' });
ok(r.status === 200, 'reminder created');
const remId = r.data.id;
let R = (await ret.get(`/api/reminders?from=${today}&to=${today}`)).data;
ok(R.rows.some(x => x.id === remId) && R.rows.every(x => x.user_name === 'Retail Sales (demo)'), 'user sees only their reminders');
ok((await cs.patch(`/api/reminders/${remId}`, { done: true })).status === 404, 'others cannot tick it');
ok((await ret.patch(`/api/reminders/${remId}`, { done: true })).status === 200, 'owner marks it done');
r = await admin.post('/api/reminders', { title: 'Follow up complaint', due_date: shift(today, 1), lead_id: compId });
ok(r.status === 200 && r.data.user_id === (await admin.get(`/api/leads/${compId}`)).data.lead.assigned_to, 'admin reminder on a lead goes to its handler');
ok((await ret.post('/api/reminders', { title: 'x', due_date: today, lead_id: compId })).status === 404, 'cannot link a reminder to an unseen record');
ok((await ret.del(`/api/reminders/${remId}`)).status === 200, 'owner deletes reminder');
ok((await admin.get('/api/reminders?overdue=1')).status === 200, 'overdue list loads');

console.log('\nSetup');
r = await admin.post('/api/setup/cities', { label: 'Testpur', state: 'Test State' });
ok(r.status === 200, 'city added');
const cityId = r.data.id;
ok((await admin.post('/api/setup/cities', { label: 'testpur' })).status === 409, 'duplicate city (case-insensitive) → 409');
ok((await admin.del(`/api/setup/sources/${idOf('sources', 'WhatsApp')}`)).status === 409, 'value in use cannot be removed');
ok((await admin.del(`/api/setup/cities/${cityId}`)).status === 200, 'unused value removed');
ok((await admin.patch(`/api/setup/types/${idOf('types', 'Corporate')}`, { default_role: 'ret' })).status === 200, 'routing rule changed');
ok((await admin.patch(`/api/setup/purposes/${idOf('purposes', 'Complaint')}`, { category: 'sales' })).status === 400, 'used purpose cannot move between leads and complaints');
ok((await admin.post('/api/setup/nope', { label: 'x' })).status === 404, 'unknown list → 404');
await admin.patch(`/api/setup/types/${idOf('types', 'Corporate')}`, { default_role: 'dist' });

console.log('\nUsers & roles');
const email = `test.${Date.now()}@shreeguruji.test`;
r = await admin.post('/api/users', { name: 'Test Person', email, role_id: 'ret', password: 'short' });
ok(r.status === 400 && r.data.fields?.password, 'weak temporary password → 400');
r = await admin.post('/api/users', { name: 'Test Person', email, role_id: 'ret', password: 'Temp1234x' });
ok(r.status === 200, 'person added');
const newId = r.data.id;
ok((await admin.post('/api/users', { name: 'Dup', email: email.toUpperCase(), role_id: 'ret', password: 'Temp1234x' })).status === 409, 'duplicate email → 409');
const np = client();
ok((await np.post('/api/auth/login', { email, password: 'Temp1234x' })).status === 200, 'new person signs in with temporary password');
ok((await np.get('/api/leads')).status === 403, 'must change password before working');
ok((await np.post('/api/auth/password', { current: 'Temp1234x', next: 'Better1234' })).status === 200, 'password changed');
ok((await np.get('/api/leads')).status === 200, 'then has access');
ok((await admin.patch(`/api/users/${userId('Admin (demo)')}`, { is_active: false })).status === 400, 'admin cannot deactivate themselves');
ok((await admin.patch(`/api/users/${userId('Admin (demo)')}`, { role_id: 'cs' })).status === 400, 'admin cannot change own role');
ok((await admin.patch(`/api/users/${newId}`, { is_active: false })).status === 200, 'person deactivated');
ok((await np.get('/api/leads')).status === 401, 'their session is revoked');
ok((await np.post('/api/auth/login', { email, password: 'Better1234' })).status === 403, 'deactivated person cannot sign in');

console.log('\nInbound capture (website / Phase 2 bot seam)');
ok((await anon.post('/api/inbound/leads', { name: 'Web Lead', phone: '9111111111' })).status === 401, 'no token → 401');
r = await anon.post('/api/inbound/leads', { name: 'Web Lead', phone: '9111111111', city: 'Indor', source: 'Website', type: 'Consumer', purpose: 'New Business Enquiry', details: 'Gift boxes' },
  { Authorization: `Bearer ${process.env.INBOUND_TOKEN}` });
ok(r.status === 200 && r.data.id, 'token caller creates a lead');
d = (await admin.get(`/api/leads/${r.data.id}`)).data;
ok(d.lead.city === null && /City given: Indor/.test(d.lead.details), 'misspelt city kept in details, not added as a city');
ok((await anon.post('/api/inbound/leads', { name: 'X', phone: '9222222222', source: 'Fax' }, { Authorization: `Bearer ${process.env.INBOUND_TOKEN}` })).status === 400, 'unknown source → 400');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
