import { guard } from '@/lib/guard';
import { Overview } from '@/components/Overview';

export default async function Page() {
  await guard('home');
  return <Overview />;
}
