import 'server-only';
import { redirect } from 'next/navigation';
import { getUser } from './auth';
import { canOpen, PageKey } from './access';

// Server-side page guard: signed in, password set, and the role may open this page.
export async function guard(key: PageKey) {
  const u = await getUser();
  if (!u) redirect('/login');
  if (u.must_change_password && key !== 'prof') redirect('/profile');
  if (!canOpen(u.role_id, key)) redirect('/');
  return u;
}
