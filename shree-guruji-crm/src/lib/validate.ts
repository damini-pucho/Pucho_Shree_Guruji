import { z } from 'zod';
import { ROLE_IDS, STAGES } from './access';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const isRealDate = (s: string) => {
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').refine(isRealDate, 'Use a valid date');
const id = z.number({ error: 'Pick a value' }).int().positive('Pick a value');
const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters`);
const required = (max: number, label: string) => text(max).min(1, `Enter ${label}`);

// Indian numbers are stored as 10 digits; +91 / leading 0 are stripped. Other formats: 10–13 digits.
export function normalizePhone(v: string) {
  let d = v.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d;
}
const phone = z.string().trim().max(20, 'Phone is too long').transform(normalizePhone)
  .refine(v => v === '' || /^[0-9]{10,13}$/.test(v), 'Enter a 10-digit phone number');
const email = text(200).refine(v => v === '' || EMAIL_RE.test(v), 'Enter a valid email');

const leadFields = {
  name: required(120, 'a name'),
  phone: phone.optional().default(''),
  email: email.optional().default(''),
  city_id: id.nullable().optional(),
  source_id: id,
  type_id: id,
  purpose_id: id,
  details: text(2000).optional().default(''),
  received_on: dateStr.optional(),
  assigned_to: id.nullable().optional(),
  remarks: text(2000).optional().default(''),
};

export const leadCreate = z.object({ ...leadFields, allow_duplicate: z.boolean().optional() }).strict()
  .refine(v => v.phone || v.email, { message: 'Enter a phone number or an email', path: ['phone'] });

export const leadPatch = z.object({
  name: leadFields.name.optional(),
  phone: phone.optional(),
  email: email.optional(),
  city_id: id.nullable().optional(),
  source_id: id.optional(),
  type_id: id.optional(),
  purpose_id: id.optional(),
  details: text(2000).optional(),
  stage: z.enum(STAGES, { error: 'Pick a valid stage' }).optional(),
  assigned_to: id.nullable().optional(),
  received_on: dateStr.optional(),
  resolved_on: dateStr.nullable().optional(),
  remarks: text(2000).optional(),
  customer_informed: z.boolean().optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'Nothing to update');

export const noteCreate = z.object({ message: required(2000, 'a note') }).strict();
export const contactLog = z.object({ channel: z.enum(['call', 'whatsapp']) }).strict();

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use a valid time');
export const reminderCreate = z.object({
  title: required(200, 'what to do'),
  due_date: dateStr,
  due_time: z.union([time, z.literal('')]).nullable().optional(),
  lead_id: id.nullable().optional(),
  user_id: id.optional(),
}).strict();
export const reminderPatch = z.object({ done: z.boolean() }).strict();

export const SETUP_KINDS = ['sources', 'types', 'purposes', 'cities'] as const;
export type SetupKind = (typeof SETUP_KINDS)[number];
const roleId = z.enum(ROLE_IDS as [string, ...string[]], { error: 'Pick a role' });
export const setupCreate = z.object({
  label: required(60, 'a value'),
  default_role: roleId.optional(),
  category: z.enum(['sales', 'complaint', 'job', 'other']).optional(),
  state: text(60).optional(),
}).strict();
export const setupPatch = z.object({
  default_role: roleId.optional(),
  category: z.enum(['sales', 'complaint', 'job', 'other']).optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'Nothing to update');

const password = z.string().min(8, 'Use at least 8 characters').max(200, 'Password is too long')
  .refine(v => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Use letters and at least one number');

export const userCreate = z.object({
  name: required(120, 'a name'),
  email: required(200, 'an email').refine(v => EMAIL_RE.test(v), 'Enter a valid email'),
  role_id: roleId,
  password,
}).strict();
export const userPatch = z.object({
  name: required(120, 'a name').optional(),
  role_id: roleId.optional(),
  is_active: z.boolean().optional(),
  password: password.optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'Nothing to update');

export const signInSchema = z.object({
  email: required(200, 'your email'),
  password: z.string().min(1, 'Enter your password').max(200),
}).strict();
export const passwordChange = z.object({ current: z.string().min(1, 'Enter your current password').max(200), next: password }).strict()
  .refine(v => v.current !== v.next, { message: 'Choose a password different from the current one', path: ['next'] });

export const inboundLead = z.object({
  name: required(120, 'a name'),
  phone: phone.optional().default(''),
  email: email.optional().default(''),
  city: text(60).optional().default(''),
  source: text(60).optional().default('Website'),
  type: text(60).optional().default('Consumer'),
  purpose: text(60).optional().default('New Business Enquiry'),
  details: text(2000).optional().default(''),
}).strict().refine(v => v.phone || v.email, { message: 'Enter a phone number or an email', path: ['phone'] });
