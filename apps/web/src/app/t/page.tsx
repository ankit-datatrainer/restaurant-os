import type { Metadata, Viewport } from 'next';
import { EnterCodeForm } from '@/components/guest/enter-code-form';

export const metadata: Metadata = {
  title: 'Enter your table code',
  description: 'Type the code printed under the QR sticker on your table to open the menu.',
};

export const viewport: Viewport = {
  themeColor: '#F7F4EE',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function EnterTablePage() {
  return (
    <div className="theme-light min-h-dvh bg-bg text-fg sm:bg-[#ECE7DC]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center bg-bg px-6 py-12 pb-[max(3rem,env(safe-area-inset-bottom,0px))] sm:border-x sm:border-line/10">
        <EnterCodeForm />
      </div>
    </div>
  );
}
