import { Suspense } from 'react';
import { guard } from '@/lib/guard';
import { Reminders } from '@/components/Reminders';

export default async function Page() {
  await guard('rem');
  return <Suspense><Reminders /></Suspense>;
}
