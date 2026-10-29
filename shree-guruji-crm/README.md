# Shree Guruji CRM — Phase 1

Lead & complaint CRM for Shree Guruji, built from the MoMs of 16 Sep 2026 (discovery) and 28 Sep 2026 (prototype review).
Next.js 16 (App Router) + PostgreSQL. The UI is the earlier HTML prototype (`prototype/`), rebuilt as React with the same
stylesheet, layout, colours and components.

## Run it

Needs Node 20+ and PostgreSQL 14+.

```bash
cd shree-guruji-crm
cp .env.example .env          # set DATABASE_URL (and DEMO_PASSWORD for demo data)
npm install
npm run db:create             # creates the database named in DATABASE_URL
npm run db:migrate            # applies db/migrations/*.sql (safe to run again)
npm run db:seed               # demo users + data — only into a database named *_dev / *_demo
npm run build && npm start    # http://localhost:3000   (or `npm run dev` while developing)
```

Sign in with a demo email (`admin@`, `cs@`, `cs2@`, `dist@`, `ret@`, `hr@shreeguruji.demo`) and `DEMO_PASSWORD` from `.env`.
With `DEMO_LOGINS=true` on a `*_dev` database, the login page also lists the personas for one-click sign-in.

For a real deployment: leave `DEMO_LOGINS` unset, do not seed, and create the first administrator:

```bash
npm run user:create -- owner@company.com "Owner Name" admin   # prints a one-time password; they must change it at first sign-in
```

Other scripts: `npm run db:reset` (drop, migrate, seed — dev/demo only) · `npm run test:api` (84 end-to-end API checks against a running server
on the seeded database; run `db:reset` afterwards) · `npm run typecheck`.

## What Phase 1 covers

| Area | What works |
|---|---|
| Overview | KPIs (open enquiries, converted with % of sales enquiries, open complaints, closed-but-customer-not-told), enquiries by source and purpose, "Needs action" queue. Every KPI opens its list. |
| Leads | Table with the grouped "Lead stage" columns, inline stage change, search (name, city, phone digits, remarks, details, handler), filters (source, type, purpose, city, assignee), stage segments with counts, pagination. **Kanban board** with drag-and-drop between the five stages (plus a stage picker on each card for touch). |
| Complaints | Same module (MoM 28 Sep): logged, assigned and tracked to closure; "customer told" flag and a "Closed, customer not told" segment. Complaints can be Closed or Rejected, never Converted. |
| Lead record (drawer) | Details, stage, reassignment, received / resolution dates (auto-filled on Closed / Rejected / Converted), customer told, remarks, open follow-ups, edit details, one-tap WhatsApp (click-to-chat link) and call. Every change is written to the **activity timeline**; notes can be added. |
| Add / log | Validated form with a managed city list (fixes the misspelt-city problem from the MoM), duplicate-phone warning ("Open it" / "Save anyway"), auto-assignment. |
| Assignment & routing | Complaints → CS, job purposes → HR, otherwise the lead type's team (editable on Setup). Inside the team the active person with the fewest open items gets it. |
| Reminders | User-specific follow-ups by day / next 7 days / overdue, linked to a lead or complaint, done / delete. Admin can set them for anyone; counts on the nav and bell. |
| Setup (admin) | Sources, cities, lead types with routing team, purposes with kind. A value in use cannot be removed. The five stages are fixed (decision of 28 Sep 2026). |
| Users & roles (admin) | Add person with temporary password, edit name / role, reset password, deactivate / reactivate (their open work returns to the team queue, sessions revoked). Page-access matrix. |
| Sign-in & roles | Email + password (argon2id), HttpOnly session cookie stored hashed, rate-limited sign-in, forced password change, server-side page guards and row scope. Admin sees everything; others see their own records plus their team's unassigned queue. |

Responsive from 375px phones to desktop; light and dark themes.

## Database (db/migrations/001_init.sql)

`roles` · `users` · `sessions` · `login_attempts` · `lead_sources` · `lead_types` · `lead_purposes` · `cities` · `leads`
(leads and complaints, `kind` column) · `activities` · `reminders` · `audit_log` · `schema_migrations` (migration tracker).
CHECK constraints enforce the stage list, "complaints are never converted", resolution date after the received date and set
exactly when a record is closed, phone / email shape and text lengths.

## API

All JSON, session-cookie authenticated, Zod-validated (`400` with field errors, `401`, `403`, `404`, `409`), cross-site writes refused.

`POST /api/auth/login|logout|password|demo` · `GET /api/me` · `GET /api/dashboard` · `GET /api/options` ·
`GET|POST /api/leads` · `GET|PATCH /api/leads/:id` · `POST /api/leads/:id/activity` · `GET|POST /api/reminders` ·
`PATCH|DELETE /api/reminders/:id` · `POST /api/setup/:kind` · `PATCH|DELETE /api/setup/:kind/:id` · `GET|POST /api/users` ·
`PATCH /api/users/:id` · `GET /api/health` ·
`POST /api/inbound/leads` — machine capture (website form now, the Phase 2 bot later): `Authorization: Bearer $INBOUND_TOKEN`;
closed when the token is unset. Unknown cities are kept in the details, never added to the city list.

## Phase 2 and later

Not built and not shown in the UI — see [docs/PHASE-2.md](docs/PHASE-2.md).
