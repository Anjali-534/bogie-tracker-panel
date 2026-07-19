'use client';
import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

// Chrome/Edge fire this before showing their own install UI; not in TS's DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Small header button, styled like the panel's other pill buttons (e.g.
// "Repeat last order") rather than a floating card. Chromium shows it once
// beforeinstallprompt fires; iOS Safari never fires that event, so tapping
// the button there instead reveals the manual Add-to-Home-Screen steps.
export default function InstallButton() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari's non-standard flag for the same thing.
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      setIsIos(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  if (!installEvent && !isIos) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (installEvent ? install() : setShowIosHint(v => !v))}
        className="flex items-center gap-1.5 text-xs font-semibold text-orange-600 border border-orange-200 rounded-lg px-3 py-2 hover:bg-orange-50 transition-colors"
      >
        <Download size={13} />
        Install App
      </button>
      {showIosHint && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs text-gray-600 z-20">
          Tap <span className="font-semibold text-gray-900">Share</span>, then{' '}
          <span className="font-semibold text-gray-900">Add to Home Screen</span> to install.
        </div>
      )}
    </div>
  );
}
