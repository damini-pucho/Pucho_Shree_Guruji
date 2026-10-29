// Database tasks: create · migrate · seed · reset · user
//   node scripts/db.mjs create                      create the database named in DATABASE_URL (local dev)
//   node scripts/db.mjs migrate                     apply db/migrations/*.sql once each (safe to re-run)
//   node scripts/db.mjs seed                        demo data — refuses a database not named *_dev / *_demo
//   node scripts/db.mjs reset                       drop all tables, migrate, seed (dev/demo only)
//   node scripts/db.mjs user <email> <name> <role>  create a user with a one-time password (must change on first sign-in)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hash } from '@node-rs/argon2';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

function dbConfig() {
  if (process.env.DB_HOST) {
    return {
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
    };
  }
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (copy .env.example to .env).'); process.exit(1); }
  return { connectionString: process.env.DATABASE_URL };
}
const dbName = () => process.env.DB_NAME || new URL(process.env.DATABASE_URL).pathname.slice(1);
const isDemoDb = () => /_(dev|demo)$/.test(dbName()) || process.argv.includes('--demo-db');

async function withClient(fn, cfg = dbConfig()) {
  const c = new pg.Client(cfg);
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function create() {
  const url = new URL(process.env.DATABASE_URL);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';
  await withClient(async c => {
    const r = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (r.rowCount) console.log(`Database ${name} already exists.`);
    else { await c.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`); console.log(`Created database ${name}.`); }
  }, { connectionString: url.toString() });
}

async function migrate() {
  await withClient(async c => {
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    const dir = path.join(ROOT, 'db', 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
    let n = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
        await c.query('COMMIT');
        console.log(`  applied ${f}`); n++;
      } catch (e) { await c.query('ROLLBACK'); console.error(`  FAILED ${f}: ${e.message}`); process.exit(1); }
    }
    console.log(n ? `Migrated: ${n} file(s).` : 'Schema is up to date.');
  });
}

// Today's date in India, as YYYY-MM-DD.
const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const shift = (s, n) => { const [y, m, d] = s.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return x.toISOString().slice(0, 10); };

async function seed() {
  if (!isDemoDb()) { console.error(`Refusing to seed "${dbName()}": demo data goes only into a database named *_dev or *_demo (or pass --demo-db).`); process.exit(1); }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8) { console.error('Set DEMO_PASSWORD (8+ characters) in .env to seed demo users.'); process.exit(1); }
  const TODAY = istToday(), D = n => shift(TODAY, -n);

  await withClient(async c => {
    const existing = await c.query('SELECT count(*)::int AS n FROM leads');
    if (existing.rows[0].n > 0) { console.log('Leads already present — seed skipped (use reset to start over).'); return; }
    await c.query('BEGIN');
    const pw = await hash(password);
    const people = [
      ['Admin (demo)', 'admin@shreeguruji.demo', 'admin'],
      ['CS Team (demo)', 'cs@shreeguruji.demo', 'cs'],
      ['CS Team 2 (demo)', 'cs2@shreeguruji.demo', 'cs'],
      ['Distributor Sales (demo)', 'dist@shreeguruji.demo', 'dist'],
      ['Retail Sales (demo)', 'ret@shreeguruji.demo', 'ret'],
      ['HR (demo)', 'hr@shreeguruji.demo', 'hr'],
    ];
    const U = {};
    for (const [name, email, role] of people) {
      const r = await c.query(
        `INSERT INTO users (name, email, role_id, password_hash) VALUES ($1,$2,$3,$4)
         ON CONFLICT (lower(email)) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [name, email, role, pw]);
      U[email.split('@')[0]] = r.rows[0].id;
    }

    const cities = [['Ahmedabad', 'Gujarat'], ['Vadodara', 'Gujarat'], ['Surat', 'Gujarat'], ['Indore', 'Madhya Pradesh'],
      ['Bhopal', 'Madhya Pradesh'], ['Ujjain', 'Madhya Pradesh'], ['Mumbai', 'Maharashtra'], ['Pune', 'Maharashtra'],
      ['Nagpur', 'Maharashtra'], ['Nashik', 'Maharashtra'], ['Kochi', 'Kerala'], ['Jaipur', 'Rajasthan']];
    for (const [l, s] of cities) await c.query('INSERT INTO cities (label, state) VALUES ($1,$2) ON CONFLICT DO NOTHING', [l, s]);

    const id = async (table, label) => (await c.query(`SELECT id FROM ${table} WHERE label = $1`, [label])).rows[0].id;
    const rows = [
      // name, phone, source, type, purpose, city, details, stage, received, resolved, remarks, user, informed
      ['Mehta Agencies', '9825011122', 'Website', 'Distributor', 'Distributorship', 'Ahmedabad', 'Wants distributorship for north Gujarat', 'In Progress', D(2), null, 'Rate card shared, waiting for deposit details', 'dist'],
      ['Agarwal Kirana Bhandar', '9893044551', 'Email (Outlook/Gmail)', 'Retailer', 'New Business Enquiry', 'Indore', 'Wants to stock the thandai and sharbat range', 'Open', D(1), null, '', 'ret'],
      ['Sharma General Store', '9977020310', 'Phone Call', 'Retailer', 'New Business Enquiry', 'Bhopal', 'Squash and crush retail pack pricing', 'In Progress', D(3), null, 'Asked for MRP list', 'ret'],
      ['Rohit Verma', '9009077881', 'WhatsApp', 'Consumer', 'New Business Enquiry', 'Mumbai', '40 Kesaria Thandai gift boxes for Diwali', 'Open', D(0), null, '', 'cs'],
      ['Vikas Traders', '9826055120', 'Phone Call', 'Distributor', 'Distributorship', 'Nagpur', 'Distributorship for Vidarbha', 'Rejected', D(9), D(6), 'Territory already allotted', 'dist'],
      ['Anita Kothari', '9827012345', 'Phone Call', 'Consumer', 'Complaint', 'Indore', 'Leaking bottle, Rose Sharbat batch RS-114', 'In Progress', D(3), null, 'Replacement dispatched', 'cs'],
      ['Sai Super Mart', '9810088776', 'Phone Call', 'Retailer', 'Complaint', 'Pune', 'Short delivery against invoice', 'Open', D(6), null, '', 'cs2'],
      ['K. Nair Stores', '9447022110', 'Website', 'Retailer', 'Complaint', 'Kochi', 'Late delivery, 9 days', 'Closed', D(8), D(5), 'Transporter changed for Kerala', 'cs', true],
      ['Priya Deshmukh', '9822031415', 'Website', 'Consumer', 'Complaint', 'Nashik', 'Seal broken on Thandai jar', 'Closed', D(4), D(1), 'Refund approved', 'cs2'],
      ['Green Leaf Caterers', '9898066554', 'Email (Outlook/Gmail)', 'Consumer', 'New Business Enquiry', 'Vadodara', 'Wedding season thandai order', 'Converted', D(12), D(4), 'Order of 120 bottles confirmed', 'cs'],
      ['Shubh Mangal Sweets', '9827140456', 'Phone Call', 'Retailer', 'New Business Enquiry', 'Ujjain', 'Thandai and sharbat for festive counter', 'Converted', D(9), D(2), 'First order placed', 'ret'],
      ['Amit Joshi', '9754066210', 'Email (Outlook/Gmail)', 'Job Applicant', 'Job Vacancy / Job Application', 'Indore', 'Applied for Sales Officer, Madhya Pradesh', 'Open', D(1), null, '', 'hr'],
      ['Neha Patel', '9909018823', 'Email (Outlook/Gmail)', 'Job Applicant', 'Job Vacancy / Job Application', 'Ahmedabad', 'Applied for Quality Executive', 'In Progress', D(5), null, 'Interview on Thursday', 'hr'],
      ['Patel Provision', '9712033009', 'Phone Call', 'Retailer', 'New Business Enquiry', 'Surat', 'Display stand and rate card', 'Open', D(0), null, '', 'ret'],
      ['Jaipur Foods Pvt Ltd', '9829012890', 'Meta (Facebook/Instagram)', 'Corporate', 'New Business Enquiry', 'Jaipur', 'Corporate Diwali gifting, 300 hampers', 'Open', D(1), null, '', 'dist'],
      ['Meena Iyer', '9867004455', 'WhatsApp', 'Consumer', 'Complaint', 'Mumbai', 'Wrong flavour delivered in online order', 'Closed', D(3), D(2), 'Exchange arranged', 'cs', false],
    ];
    const leadIds = [];
    for (const r of rows) {
      const [name, phone, src, type, purpose, city, details, stage, received, resolved, remarks, user, informed] = r;
      const purposeRow = (await c.query('SELECT id, category FROM lead_purposes WHERE label = $1', [purpose])).rows[0];
      const role = (await c.query('SELECT role_id FROM users WHERE id = $1', [U[user]])).rows[0].role_id;
      const ins = await c.query(
        `INSERT INTO leads (kind, name, phone, city_id, source_id, type_id, purpose_id, details, stage, team_id, assigned_to,
           received_on, resolved_on, remarks, customer_informed, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$12::date + time '10:00') RETURNING id`,
        [purposeRow.category === 'complaint' ? 'complaint' : 'lead', name, phone, await id('cities', city), await id('lead_sources', src),
          await id('lead_types', type), purposeRow.id, details, stage, role, U[user], received, resolved, remarks, !!informed, U.admin]);
      const lid = ins.rows[0].id; leadIds.push(lid);
      await c.query(`INSERT INTO activities (lead_id, user_id, type, message, created_at) VALUES ($1,$2,'created',$3,$4::date + time '10:00')`,
        [lid, U.admin, `Enquiry received via ${src}`, received]);
      if (stage !== 'Open') await c.query(`INSERT INTO activities (lead_id, user_id, type, message, created_at) VALUES ($1,$2,'stage',$3,$4::date + time '15:00')`,
        [lid, U[user], `Stage changed to ${stage}`, resolved || received]);
      if (remarks) await c.query(`INSERT INTO activities (lead_id, user_id, type, message, created_at) VALUES ($1,$2,'update',$3,$4::date + time '15:05')`,
        [lid, U[user], `Remarks: ${remarks}`, resolved || received]);
      if (informed) await c.query(`INSERT INTO activities (lead_id, user_id, type, message, created_at) VALUES ($1,$2,'informed','Marked: customer told',$3::date + time '16:00')`,
        [lid, U[user], resolved]);
    }

    const rem = [
      ['Call back about distributorship deposit', TODAY, '10:30', 0, 'dist'],
      ['Send rate card to Agarwal Kirana Bhandar', TODAY, '12:00', 1, 'ret'],
      ['Confirm replacement bottle reached the customer', TODAY, '16:00', 5, 'cs'],
      ['Share MRP list on WhatsApp', TODAY, null, 2, 'ret', true],
      ['Check short delivery against invoice', D(2), '11:00', 6, 'cs2'],
      ['Gift box quote to Rohit Verma', shift(TODAY, 1), '11:30', 3, 'cs'],
      ['Interview: Neha Patel, Quality Executive', shift(TODAY, 1), '15:00', 12, 'hr'],
      ['Weekly enquiry review', shift(TODAY, 3), '09:30', null, 'admin'],
      ['Visit Patel Provision with display stand', shift(TODAY, 5), '14:00', 13, 'ret'],
      ['Corporate hamper proposal to Jaipur Foods', TODAY, '17:00', 14, 'dist'],
    ];
    for (const [title, date, time, li, user, done] of rem) {
      await c.query(`INSERT INTO reminders (title, due_date, due_time, lead_id, user_id, created_by, done, done_at)
                     VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`,
        [title, date, time, li == null ? null : leadIds[li], U[user], !!done, done ? new Date() : null]);
    }
    await c.query('COMMIT');
    console.log(`Seeded ${people.length} demo users, ${cities.length} cities, ${rows.length} leads/complaints, ${rem.length} reminders.`);
    console.log('Demo users sign in with DEMO_PASSWORD from .env (or the persona picker when DEMO_LOGINS=true).');
  });
}

async function reset() {
  if (!isDemoDb()) { console.error(`Refusing to reset "${dbName()}": only *_dev / *_demo databases can be reset.`); process.exit(1); }
  await withClient(c => c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'));
  console.log('Dropped all tables.');
  await migrate();
  await seed();
}

async function user([email, name, role]) {
  if (!email || !name || !role) { console.error('Usage: npm run user:create -- <email> "<name>" <admin|cs|dist|ret|hr>'); process.exit(1); }
  const temp = process.env.NEW_USER_PASSWORD || crypto.randomBytes(9).toString('base64url');
  await withClient(async c => {
    const r = await c.query(
      `INSERT INTO users (name, email, role_id, password_hash, must_change_password) VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (lower(email)) DO NOTHING RETURNING id`, [name, email, role, await hash(temp)]);
    if (!r.rowCount) { console.error(`A user with ${email} already exists.`); process.exit(1); }
    await c.query(`INSERT INTO audit_log (actor_id, action, entity, entity_id, detail) VALUES (NULL,'user.bootstrap','user',$1,$2)`,
      [String(r.rows[0].id), JSON.stringify({ email, role })]);
    console.log(`Created ${email} (${role}). One-time password: ${temp}\nThey must set a new password at first sign-in.`);
  });
}

const [cmd, ...args] = process.argv.slice(2);
const tasks = { create, migrate, seed, reset, user: () => user(args.filter(a => !a.startsWith('--'))) };
if (!tasks[cmd]) { console.error('Usage: node scripts/db.mjs <create|migrate|seed|reset|user>'); process.exit(1); }
tasks[cmd]().catch(e => { console.error(e.message); process.exit(1); });
