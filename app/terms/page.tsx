import LegalPageChrome from '@/components/LegalPageChrome';
import { TERMS_CONTENT, LAST_UPDATED } from '@/lib/legalContent';

export default function TermsPage() {
  return <LegalPageChrome title="Terms of Service" lastUpdated={LAST_UPDATED} content={TERMS_CONTENT} />;
}
