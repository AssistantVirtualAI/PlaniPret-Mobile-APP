import { useMemo, useRef, useState } from 'react';
import { useEffect } from 'react';
import { PhoneFrame } from '@/components/mobile-preview/PhoneFrame';
import { DeviceToolbar, DEVICES, DeviceKey } from '@/components/mobile-preview/DeviceToolbar';
import { MobileIframe } from '@/components/mobile-preview/MobileIframe';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const DEFAULT_URL =
  (import.meta.env.VITE_MOBILE_PREVIEW_URL as string | undefined) ||
  `${window.location.origin}/m`;

const TAB_LINKS: { label: string; tab: string }[] = [
  { label: 'Home', tab: 'home' },
  { label: 'Calls', tab: 'calls' },
  { label: 'AVA Chat', tab: 'ava' },
  { label: 'Queues', tab: 'queues' },
  { label: 'More', tab: 'more' },
];

const SUB_LINKS = [
  'recordings', 'voicemail', 'messages', 'contacts',
  'settings', 'permissions', 'privacy', 'datasafety',
  'aiaudit', 'support',
];

export default function MobilePreview() {
  const [device, setDevice] = useState<DeviceKey>('iphone15pro');
  const [landscape, setLandscape] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [reloadKey, setReloadKey] = useState(0);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_URL);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const dev = DEVICES[device];
  const w = landscape ? dev.h : dev.w;
  const h = landscape ? dev.w : dev.h;

  const url = useMemo(() => {
    const u = new URL(baseUrl);
    u.searchParams.set('theme', theme);
    u.searchParams.set('preview', '1');
    return u.toString();
  }, [baseUrl, theme]);

  const postNav = (msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'ava-preview', ...msg }, '*');
  };

  useEffect(() => {
    document.title = 'Mobile Preview — AVA Softphone';
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">


      <div className="max-w-7xl mx-auto space-y-4">
        <header>
          <h1 className="text-2xl font-bold">AVA Softphone — Mobile Preview</h1>
          <p className="text-sm text-muted-foreground">
            Inspect the mobile app inside a realistic device frame. Switch device, orientation and theme.
          </p>
        </header>

        <DeviceToolbar
          device={device}
          onDevice={setDevice}
          landscape={landscape}
          onToggleOrientation={() => setLandscape((l) => !l)}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          onReload={() => setReloadKey((k) => k + 1)}
          url={url}
        />

        <div className="flex flex-col lg:flex-row gap-6">
          <Card className="flex-1 p-6 flex items-center justify-center bg-muted/30 overflow-auto">
            <PhoneFrame width={w} height={h} variant={dev.variant}>
              <MobileIframe key={reloadKey} ref={iframeRef} src={url} width={w} height={h} />
            </PhoneFrame>
          </Card>

          <aside className="w-full lg:w-72 space-y-4">
            <Card className="p-4">
              <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">Tabs</h2>
              <div className="grid grid-cols-2 gap-2">
                {TAB_LINKS.map((t) => (
                  <Button key={t.tab} size="sm" variant="outline" onClick={() => postNav({ type: 'set-tab', tab: t.tab })}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-3 text-sm uppercase tracking-wide text-muted-foreground">More → Subpages</h2>
              <div className="flex flex-wrap gap-2">
                {SUB_LINKS.map((s) => (
                  <Button key={s} size="sm" variant="ghost" className="capitalize"
                    onClick={() => postNav({ type: 'set-subpage', subpage: s })}>
                    {s}
                  </Button>
                ))}
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Preview source</h2>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background"
              />
              <p className="text-xs text-muted-foreground">
                URL of the mobile app build. Defaults to the deployed preview.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
