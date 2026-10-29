import { route } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { navSummary } from '@/lib/leads';

export const GET = route(async () => {
  const u = await requireUser({ allowMustChange: true });
  return { user: u, counts: u.must_change_password ? null : await navSummary(u) };
});
