import type { Metadata } from 'next';
import { PlatformConsole } from '@/components/platform/console';

export const metadata: Metadata = {
  title: { absolute: 'Restaurant OS console' },
};

export default function PlatformPage() {
  return <PlatformConsole />;
}
