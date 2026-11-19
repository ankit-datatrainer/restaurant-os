import type { Metadata } from 'next';
import { FeedbackView } from '@/components/admin/feedback-view';

export const metadata: Metadata = { title: 'Feedback' };

export default function AdminFeedbackPage() {
  return <FeedbackView />;
}
