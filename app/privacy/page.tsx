import LegalPageChrome from '@/components/LegalPageChrome';
import { PRIVACY_CONTENT, LAST_UPDATED } from '@/lib/legalContent';

export default function PrivacyPage() {
  return <LegalPageChrome title="Privacy Policy" lastUpdated={LAST_UPDATED} content={PRIVACY_CONTENT} />;
}
