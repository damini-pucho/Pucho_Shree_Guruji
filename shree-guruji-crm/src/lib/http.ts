import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const bad = (message: string, fields?: Record<string, string>) => new ApiError(400, message, fields);
export const notFound = (what = 'Record') => new ApiError(404, `${what} not found`);
export const forbidden = (message = 'You do not have access to this') => new ApiError(403, message);

function zodFields(e: ZodError) {
  const fields: Record<string, string> = {};
  for (const i of e.issues) {
    const k = i.path.join('.') || '_';
    if (!fields[k]) fields[k] = i.message;
  }
  return fields;
}

// Refuse cross-site writes: a mutating request must come from this app's own origin.
function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return true; // non-browser callers (curl, server-to-server) send no Origin
  try {
    const o = new URL(origin);
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
    const allowed = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).host : null;
    return o.host === host || o.host === allowed;
  } catch {
    return false;
  }
}

type Ctx = { params: Promise<Record<string, string>> };

export function route(fn: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      if (req.method !== 'GET' && !sameOrigin(req)) throw forbidden('Cross-site request refused');
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e: any) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message, fields: e.fields, ...e.extra }, { status: e.status });
      }
      if (e instanceof ZodError) {
        const fields = zodFields(e);
        return NextResponse.json({ error: Object.values(fields)[0] || 'Check the highlighted fields', fields }, { status: 400 });
      }
      // PostgreSQL constraint errors become client errors, never 500s.
      if (e?.code === '23505') return NextResponse.json({ error: 'That value already exists' }, { status: 409 });
      if (e?.code === '23514' || e?.code === '23503' || e?.code === '22P02' || e?.code === '22007' || e?.code === '22008') {
        return NextResponse.json({ error: 'The data was refused by a validation rule' }, { status: 400 });
      }
      console.error('[api]', req.method, new URL(req.url).pathname, e?.message || e);
      return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 });
    }
  };
}

export async function body(req: Request): Promise<unknown> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > 256 * 1024) throw new ApiError(413, 'Request too large');
  try {
    return await req.json();
  } catch {
    throw bad('Request body must be JSON');
  }
}

export const intId = (v: string | undefined) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
};
