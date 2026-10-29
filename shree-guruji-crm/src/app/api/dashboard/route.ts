import { route } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { dashboard } from '@/lib/leads';

export const GET = route(async () => dashboard(await requireUser()));
