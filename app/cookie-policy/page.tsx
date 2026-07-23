import LegalPageChrome from '@/components/LegalPageChrome';
import { COOKIE_CONTENT, LAST_UPDATED } from '@/lib/legalContent';

export default function CookiePolicyPage() {
  return <LegalPageChrome title="Cookie Policy" lastUpdated={LAST_UPDATED} content={COOKIE_CONTENT} />;
}
