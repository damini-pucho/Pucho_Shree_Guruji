-- Shree Guruji CRM — Phase 1 schema.
-- Leads and complaints share one table (MoM 28 Sep 2026: complaint management sits inside the Lead module).

-- Teams / access roles. Fixed set: page access is enforced in code (src/lib/access.ts).
CREATE TABLE roles (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  short_name  text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort        int  NOT NULL DEFAULT 0
);

CREATE TABLE users (
  id                    serial PRIMARY KEY,
  name                  text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  email                 text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role_id               text NOT NULL REFERENCES roles(id),
  password_hash         text NOT NULL,
  is_active             boolean NOT NULL DEFAULT true,
  must_change_password  boolean NOT NULL DEFAULT false,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE sessions (
  id          bigserial PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,
  user_id     int  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE login_attempts (
  id     bigserial PRIMARY KEY,
  email  text NOT NULL,
  ok     boolean NOT NULL,
  at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (lower(email), at DESC);

-- Setup lists (managed by Admin on the Setup page).
CREATE TABLE lead_sources (
  id         serial PRIMARY KEY,
  label      text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  sort       int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lead_sources_label_uq ON lead_sources (lower(label));

CREATE TABLE lead_types (
  id           serial PRIMARY KEY,
  label        text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  default_role text NOT NULL REFERENCES roles(id) DEFAULT 'cs',   -- team a new enquiry of this type is routed to
  sort         int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lead_types_label_uq ON lead_types (lower(label));

CREATE TABLE lead_purposes (
  id         serial PRIMARY KEY,
  label      text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  -- sales: counts toward conversion · complaint: goes to the Complaints list (CS) · job: routed to HR · other
  category   text NOT NULL DEFAULT 'other' CHECK (category IN ('sales','complaint','job','other')),
  sort       int  NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lead_purposes_label_uq ON lead_purposes (lower(label));

-- Managed city list: operators pick a city instead of typing it (MoM: misspelt cities break filtering).
CREATE TABLE cities (
  id         serial PRIMARY KEY,
  label      text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  state      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cities_label_uq ON cities (lower(label));

CREATE TABLE leads (
  id                 serial PRIMARY KEY,
  kind               text NOT NULL CHECK (kind IN ('lead','complaint')),   -- derived from the purpose's category
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  phone              text NOT NULL DEFAULT '' CHECK (phone = '' OR phone ~ '^[0-9]{10,13}$'),
  email              text NOT NULL DEFAULT '' CHECK (email = '' OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city_id            int  REFERENCES cities(id),
  source_id          int  NOT NULL REFERENCES lead_sources(id),
  type_id            int  NOT NULL REFERENCES lead_types(id),
  purpose_id         int  NOT NULL REFERENCES lead_purposes(id),
  details            text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  stage              text NOT NULL DEFAULT 'Open'
                     CHECK (stage IN ('Open','In Progress','Closed','Rejected','Converted')),
  team_id            text NOT NULL REFERENCES roles(id),
  assigned_to        int  REFERENCES users(id),
  received_on        date NOT NULL DEFAULT CURRENT_DATE,
  resolved_on        date,
  remarks            text NOT NULL DEFAULT '' CHECK (length(remarks) <= 2000),
  customer_informed  boolean NOT NULL DEFAULT false,
  created_by         int  REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leads_resolved_after_received CHECK (resolved_on IS NULL OR resolved_on >= received_on),
  CONSTRAINT leads_complaint_not_converted CHECK (kind = 'lead' OR stage <> 'Converted'),
  CONSTRAINT leads_resolved_when_done CHECK (
    (stage IN ('Open','In Progress') AND resolved_on IS NULL) OR
    (stage IN ('Closed','Rejected','Converted') AND resolved_on IS NOT NULL))
);
CREATE INDEX leads_kind_stage_idx ON leads (kind, stage);
CREATE INDEX leads_assigned_idx   ON leads (assigned_to);
CREATE INDEX leads_team_idx       ON leads (team_id);
CREATE INDEX leads_phone_idx      ON leads (phone);
CREATE INDEX leads_received_idx   ON leads (received_on DESC);

-- Activity timeline of a lead / complaint.
CREATE TABLE activities (
  id         bigserial PRIMARY KEY,
  lead_id    int  NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id    int  REFERENCES users(id),
  type       text NOT NULL CHECK (type IN ('created','stage','assign','update','note','call','whatsapp','reminder','informed')),
  message    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_lead_idx ON activities (lead_id, created_at DESC);

-- User-specific follow-up reminders.
CREATE TABLE reminders (
  id          serial PRIMARY KEY,
  title       text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  due_date    date NOT NULL,
  due_time    time,
  lead_id     int  REFERENCES leads(id) ON DELETE SET NULL,
  user_id     int  NOT NULL REFERENCES users(id),      -- whose reminder it is
  created_by  int  REFERENCES users(id),
  done        boolean NOT NULL DEFAULT false,
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminders_user_date_idx ON reminders (user_id, due_date);
CREATE INDEX reminders_lead_idx ON reminders (lead_id);

-- Administrative audit trail (users, setup lists, sign-ins).
CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  actor_id  int REFERENCES users(id),
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id text,
  detail    jsonb NOT NULL DEFAULT '{}'::jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);

-- Reference data every deployment needs.
INSERT INTO roles (id, name, short_name, description, sort) VALUES
  ('admin', 'Admin (Management)', 'Admin',             'Sees every enquiry, edits setup, manages users', 1),
  ('cs',    'CS Team',            'CS Team',           'Consumer enquiries and all complaints',          2),
  ('dist',  'Distributor Sales',  'Distributor Sales', 'Distributor and distributorship enquiries',      3),
  ('ret',   'Retail Sales',       'Retail Sales',      'Retailer enquiries',                             4),
  ('hr',    'HR (Hiring)',        'HR',                'Job applications and vacancy enquiries',         5);

INSERT INTO lead_sources (label, sort) VALUES
  ('WhatsApp', 1), ('Website', 2), ('Email (Outlook/Gmail)', 3), ('Phone Call', 4), ('Meta (Facebook/Instagram)', 5);

INSERT INTO lead_types (label, default_role, sort) VALUES
  ('Distributor', 'dist', 1), ('Retailer', 'ret', 2), ('Consumer', 'cs', 3), ('Corporate', 'dist', 4), ('Job Applicant', 'hr', 5);

INSERT INTO lead_purposes (label, category, sort) VALUES
  ('Distributorship', 'sales', 1), ('New Business Enquiry', 'sales', 2), ('Complaint', 'complaint', 3),
  ('Job Vacancy / Job Application', 'job', 4);
