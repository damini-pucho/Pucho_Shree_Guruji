import { route, body, intId } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { getLeadDetail, updateLead } from '@/lib/leads';
import { leadPatch } from '@/lib/validate';

export const GET = route(async (_req, ctx) => {
  const u = await requireUser();
  return getLeadDetail(u, intId((await ctx.params).id));
});

export const PATCH = route(async (req, ctx) => {
  const u = await requireUser();
  const id = intId((await ctx.params).id);
  return updateLead(u, id, leadPatch.parse(await body(req)));
});
