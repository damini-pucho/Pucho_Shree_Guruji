import { route, body } from '@/lib/http';
import { signIn } from '@/lib/auth';
import { signInSchema } from '@/lib/validate';

export const POST = route(async req => {
  const { email, password } = signInSchema.parse(await body(req));
  await signIn(email, password);
  return { ok: true };
});
