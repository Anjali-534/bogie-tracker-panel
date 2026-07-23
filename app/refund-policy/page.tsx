import LegalPageChrome from '@/components/LegalPageChrome';
import { REFUND_CONTENT, LAST_UPDATED } from '@/lib/legalContent';

export default function RefundPolicyPage() {
  return <LegalPageChrome title="Refund & Cancellation Policy" lastUpdated={LAST_UPDATED} content={REFUND_CONTENT} />;
}
