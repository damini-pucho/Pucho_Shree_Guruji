import { guard } from '@/lib/guard';
import { Users } from '@/components/Users';

export default async function Page() {
  await guard('users');
  return <Users />;
}
