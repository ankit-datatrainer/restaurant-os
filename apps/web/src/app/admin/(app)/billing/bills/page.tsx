import { redirect } from 'next/navigation';

/** /admin/billing/bills on its own is the "Settled bills" tab of Billing. */
export default function AdminBillsIndexPage() {
  redirect('/admin/billing?tab=bills');
}
