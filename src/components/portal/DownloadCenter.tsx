import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Apple, Smartphone, MonitorDown, Chrome } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/integrations/supabase/client';

const GH_REPO = 'AssistantVirtualAI/attach-app-creator';

function fmtSize(b?: number) {
  if (!b) return '';
  const mb = b / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
}

export function DownloadCenter({ personalize = false }: { personalize?: boolean }) {
  const { data: dbRelease } = useQuery({
    queryKey: ['app_releases_latest'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('app_releases')
        .select('tag, name, platform_urls, assets, published_at')
        .eq('is_latest', true)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60_000,
  });

  const { data: ghRelease } = useQuery({
    queryKey: ['gh-release', GH_REPO],
    queryFn: async () => {
      const r = await fetch(`https://api.github.com/repos/${GH_REPO}/releases/latest`);
      if (!r.ok) return null;
      return r.json();
    },
    retry: false,
    staleTime: 60 * 60_000,
    enabled: !dbRelease,
  });
  const release = dbRelease || ghRelease;

  const [me, setMe] = useState<{ email?: string; ext?: string }>({});
  useEffect(() => {
    if (!personalize) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const email = data.user?.email;
      const { data: spu } = await (supabase as any).from('pbx_softphone_users')
        .select('extension').eq('portal_user_id', data.user?.id).maybeSingle();
      setMe({ email: email ?? undefined, ext: spu?.extension });
    })();
  }, [personalize]);

  const platformUrls = (release as any)?.platform_urls || {};
  const assetsList: any[] = Array.isArray((release as any)?.assets) ? (release as any).assets : [];
  const findAsset = (suffix: string) =>
    assetsList.find((a: any) => (a.name || '').toLowerCase().endsWith(suffix.toLowerCase()));
  const findAssetIntel = () =>
    assetsList.find((a: any) => {
      const n = (a.name || '').toLowerCase();
      return n.endsWith('.dmg') && !n.includes('arm64');
    });
  const macArm = platformUrls.mac_arm64
    ? { name: 'macOS Apple Silicon', browser_download_url: platformUrls.mac_arm64, size: 0 }
    : findAsset('arm64.dmg');
  const macX64 = platformUrls.mac_x64
    ? { name: 'macOS Intel', browser_download_url: platformUrls.mac_x64, size: 0 }
    : (findAsset('x64.dmg') || findAssetIntel());
  const win = platformUrls.windows
    ? { name: 'Windows', browser_download_url: platformUrls.windows, size: 0 }
    : findAsset('.exe');
  const linux = platformUrls.linux
    ? { name: 'Linux', browser_download_url: platformUrls.linux, size: 0 }
    : findAsset('.AppImage');
  const ver = (release as any)?.tag || (release as any)?.tag_name || '';

  // Hardcoded fallback URLs from official release channel
  const BASE_URL = `https://github.com/${GH_REPO}/releases/latest/download`;
  const fallbackMacArm = `${BASE_URL}/Lemtel.Telecom-arm64.dmg`;
  const fallbackMacIntel = `${BASE_URL}/Lemtel.Telecom.dmg`;
  const fallbackWin = `${BASE_URL}/Lemtel.Telecom.Setup.exe`;

  const qrPayload = JSON.stringify({
    portal: 'avastatistic.ca',
    email: me.email, ext: me.ext,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Download Lemtel Telecom</h1>
        <p className="text-muted-foreground">Available on all your devices. {ver && <span>Latest: <strong>{ver}</strong></span>}</p>
        {personalize && me.ext && (
          <p className="text-sm mt-2">Your extension: <strong>{me.ext}</strong> · {me.email}</p>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MonitorDown className="h-4 w-4" /> Desktop</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button asChild variant="outline" disabled={!macArm && !fallbackMacArm}>
            <a href={macArm?.browser_download_url ?? fallbackMacArm}><Apple className="h-4 w-4 mr-2" /> macOS Apple Silicon {macArm && <span className="ml-2 text-xs text-muted-foreground">{fmtSize(macArm.size)}</span>}</a>
          </Button>
          <Button asChild variant="outline" disabled={!macX64 && !fallbackMacIntel}>
            <a href={macX64?.browser_download_url ?? fallbackMacIntel}><Apple className="h-4 w-4 mr-2" /> macOS Intel {macX64 && <span className="ml-2 text-xs text-muted-foreground">{fmtSize(macX64.size)}</span>}</a>
          </Button>
          <Button asChild variant="outline" disabled={!win && !fallbackWin}>
            <a href={win?.browser_download_url ?? fallbackWin}><MonitorDown className="h-4 w-4 mr-2" /> Windows 10/11 {win && <span className="ml-2 text-xs text-muted-foreground">{fmtSize(win.size)}</span>}</a>
          </Button>
          <Button asChild variant="outline" disabled={!linux}>
            <a href={linux?.browser_download_url ?? '#'}><MonitorDown className="h-4 w-4 mr-2" /> Linux AppImage {linux && <span className="ml-2 text-xs text-muted-foreground">{fmtSize(linux.size)}</span>}</a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Mobile</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-4 items-center">
          <Button asChild variant="outline"><a href="https://apps.apple.com/app/lemtel-telecom">iPhone & iPad — App Store</a></Button>
          <Button asChild variant="outline"><a href="https://play.google.com/store/apps/details?id=com.lemtel.softphone">Android — Google Play</a></Button>
          {personalize && me.ext && (
            <div className="rounded-md border p-3 bg-muted/30">
              <p className="text-xs mb-2 text-muted-foreground">Scan to auto-configure mobile</p>
              <QRCodeSVG value={qrPayload} size={120} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Chrome className="h-4 w-4" /> Chrome Extension</CardTitle></CardHeader>
        <CardContent>
          <Button asChild variant="outline"><a href="https://chromewebstore.google.com/">Install Click-to-Dial</a></Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>System Requirements</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1">
            <li><strong>macOS</strong>: 11 Big Sur or later</li>
            <li><strong>Windows</strong>: Windows 10 64-bit or later</li>
            <li><strong>Linux</strong>: Ubuntu 18.04+ or equivalent</li>
            <li><strong>iOS</strong>: iOS 15 or later</li>
            <li><strong>Android</strong>: Android 8.0 or later</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
