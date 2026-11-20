import type { Metadata } from 'next';
import { SetupScreen } from '@/components/signup/setup-screen';

export const metadata: Metadata = {
  title: 'Set up your restaurant',
  description: 'Add your restaurant to Restaurant OS and start your free trial.',
};

/** Lives outside the (app) guard: the account has no staff row until the restaurant exists. */
export default function AdminSetupPage() {
  return <SetupScreen />;
}
