import { redirect } from 'next/navigation';
import { demoLoginsEnabled, getUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { LoginView } from '@/components/LoginView';

export const metadata = { title: 'Sign in · Shree Guruji CRM' };

export default async function LoginPage() {
  if (await getUser()) redirect('/');
  const personas = demoLoginsEnabled()
    ? await q(`SELECT u.id, u.name, r.name AS role_name, r.description FROM users u JOIN roles r ON r.id = u.role_id
                WHERE u.is_active AND u.email LIKE '%@shreeguruji.demo' ORDER BY r.sort, u.name`)
    : null;
  return <LoginView personas={personas} />;
}
