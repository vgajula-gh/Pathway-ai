import { useEffect, useState } from 'react';
import { Sheet } from './ui';
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
export default function InstallPathway() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null), [help, setHelp] = useState(false), [offline, setOffline] = useState(!navigator.onLine);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
  const [installed, setInstalled] = useState(!!standalone());
  useEffect(() => {
    const install = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent); };
    const done = () => { setInstalled(true); setPrompt(null); };
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener('beforeinstallprompt', install); window.addEventListener('appinstalled', done); window.addEventListener('online', online); window.addEventListener('offline', online);
    return () => { window.removeEventListener('beforeinstallprompt', install); window.removeEventListener('appinstalled', done); window.removeEventListener('online', online); window.removeEventListener('offline', online); };
  }, []);
  return <><div style={{ maxWidth: 600, margin: '0 auto', padding: 10 }}>{offline && <p role="status" className="note">You’re offline. Pathway’s shell can open, but live student data needs a connection. Your saved profile stays in place.</p>}{!installed && <button className="link" onClick={async () => { if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(null); } else setHelp(true); }}>Install Pathway</button>}</div>
    {help && <Sheet title="Install Pathway" onClose={() => setHelp(false)}><p>On iPhone or iPad: open Pathway in Safari, tap Share, then Add to Home Screen. Open the installed app before enabling notifications.</p><p style={{ marginTop: 16 }}>On Android or desktop: open your browser’s menu and choose Install app or Add to Home Screen. If your browser offers an install prompt, you can use that.</p><p className="note">Installation is optional. Student data is not cached for offline access.</p></Sheet>}
  </>;
}
