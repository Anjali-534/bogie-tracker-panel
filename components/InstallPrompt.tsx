'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

// Chrome/Edge fire this before showing their own install UI; not in TS's DOM lib.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'tracker_pwa_install_dismissed';

// Floating install prompt + service-worker registration. On Chromium the
// banner only appears once the browser fires beforeinstallprompt (i.e. the
// app is installable and not yet installed). iOS Safari never fires it, so
// we show a one-time Add-to-Home-Screen instruction there instead. Every
// other unsupported browser gets nothing.
export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    if (localStorage.getItem(DISMISS_KEY)) return;

    // display-mode: standalone means we're already running as the installed app.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari's non-standard flag for the same thing.
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isIos) {
      setShowIosHint(true);
      return;
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setInstallEvent(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    // Either way the event is spent; if declined, don't nag again.
    if (outcome === 'dismissed') localStorage.setItem(DISMISS_KEY, '1');
    setInstallEvent(null);
  }

  if (!installEvent && !showIosHint) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-800 p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center flex-shrink-0">
          <Download size={16} className="text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install Bogie Tracker</p>
          {installEvent ? (
            <>
              <p className="text-xs text-gray-400 mt-0.5">
                Get the panel as an app — faster access, its own window.
              </p>
              <button
                onClick={install}
                className="mt-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Install
              </button>
            </>
          ) : (
            <p className="text-xs text-gray-400 mt-0.5">
              Tap <span className="text-gray-200 font-medium">Share</span>, then{' '}
              <span className="text-gray-200 font-medium">Add to Home Screen</span> to install.
            </p>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss" className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
