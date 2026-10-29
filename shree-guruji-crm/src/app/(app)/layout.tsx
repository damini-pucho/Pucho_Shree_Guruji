import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { demoLoginsEnabled, getUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { Shell } from '@/components/Shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getUser();
  if (!me) redirect('/login');
  const personas = demoLoginsEnabled()
    ? await q(`SELECT u.id, u.name, r.short_name AS role_short FROM users u JOIN roles r ON r.id = u.role_id
                WHERE u.is_active AND u.email LIKE '%@shreeguruji.demo' ORDER BY r.sort, u.name`)
    : null;
  return <Shell me={me} demoPersonas={personas}>{children}</Shell>;
}
