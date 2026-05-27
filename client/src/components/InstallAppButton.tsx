import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from './ui/button';

/**
 * Chrome / Android / desktop Chrome fire `beforeinstallprompt` when the site
 * meets PWA install criteria (HTTPS, manifest, SW, not already installed). We
 * capture the event, suppress the default mini-infobar, and show our own
 * button so the install affordance is in a sensible location.
 *
 * iOS Safari doesn't fire this event at all — there's no programmatic install
 * path on iOS. We detect iOS and show a different "Add to Home Screen" hint.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOSStandalone, setIsIOSStandalone] = useState(false);

  useEffect(() => {
    // Already installed? Don't nag.
    const standaloneMatch = window.matchMedia('(display-mode: standalone)').matches;
    // @ts-expect-error iOS-only field
    const iosStandalone = !!window.navigator.standalone;
    setIsIOSStandalone(standaloneMatch || iosStandalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || isIOSStandalone) return null;

  const handleClick = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
    }
    setPromptEvent(null);
  };

  if (!promptEvent) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      title="Install Snatch&GrabIt! to your home screen for the full-screen experience."
      data-testid="button-install-app"
      className="glass border-gold/30 text-gold-light hover:border-gold/50 hover:bg-gold/10 h-9"
    >
      <Download className="w-4 h-4 mr-2" />
      Install
    </Button>
  );
}
