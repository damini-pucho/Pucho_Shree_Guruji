import { guard } from '@/lib/guard';
import { Setup } from '@/components/Setup';

export default async function Page() {
  await guard('set');
  return <Setup />;
}
