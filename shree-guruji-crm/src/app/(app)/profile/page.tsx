import { guard } from '@/lib/guard';
import { Profile } from '@/components/Profile';

export default async function Page() {
  await guard('prof');
  return <Profile />;
}
