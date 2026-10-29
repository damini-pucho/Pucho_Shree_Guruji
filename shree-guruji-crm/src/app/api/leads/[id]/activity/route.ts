import { route, body, intId } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { addActivity } from '@/lib/leads';
import { contactLog, noteCreate } from '@/lib/validate';

// A note typed by a person, or a log line when they start a call / WhatsApp chat from the CRM.
export const POST = route(async (req, ctx) => {
  const u = await requireUser();
  const id = intId((await ctx.params).id);
  const b = (await body(req)) as Record<string, unknown>;
  if (b && 'channel' in b) {
    const { channel } = contactLog.parse(b);
    await addActivity(u, id, channel, channel === 'call' ? 'Call started from CRM' : 'WhatsApp chat opened');
  } else {
    const { message } = noteCreate.parse(b);
    await addActivity(u, id, 'note', `Note: ${message}`);
  }
  return { ok: true };
});
