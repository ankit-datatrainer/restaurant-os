import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PrintSheet } from '@/components/admin/print-sheet';
import { Spinner } from '@/components/ui';

export const metadata: Metadata = { title: 'Print QR sheet' };

export default function AdminTablesPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Spinner className="text-ember" />
        </div>
      }
    >
      <PrintSheet />
    </Suspense>
  );
}
