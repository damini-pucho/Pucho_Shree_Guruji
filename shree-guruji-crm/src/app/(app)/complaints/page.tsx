import { Suspense } from 'react';
import { guard } from '@/lib/guard';
import { LeadList } from '@/components/LeadList';

export default async function Page() {
  await guard('comp');
  return <Suspense><LeadList kind="complaint" /></Suspense>;
}
