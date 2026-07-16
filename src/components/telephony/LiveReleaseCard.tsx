import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, Apple, Monitor, Smartphone, Chrome } from "lucide-react";

const GITHUB_REPO = "AssistantVirtualAI/attach-app-creator";

type Release = {
  tag: string;
  name: string | null;
  url: string | null;
  published_at: string | null;
  platform_urls: Record<string, string>;
};

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

export function LiveReleaseCard() {
  const [release, setRelease] = useState<Release | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("app_releases")
      .select("tag,name,url,published_at,platform_urls")
      .eq("is_latest", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setRelease(data as Release);
      });

    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const urls: Record<string, string> = {};
        (data.assets || []).forEach((a: any) => {
          const n = (a.name || "").toLowerCase();
          const u = a.browser_download_url;
          if (!u) return;
          if (n.includes("arm64") && n.endsWith(".dmg")) urls.mac_arm64 = u;
          else if ((n.includes("x64") || n.includes("intel")) && n.endsWith(".dmg")) urls.mac_x64 = u;
          else if (n.endsWith(".dmg")) urls.mac = u;
          else if (n.endsWith(".exe")) urls.windows = u;
          else if (n.endsWith(".appimage")) urls.linux = u;
          else if (n.endsWith(".apk")) urls.android = u;
          else if (n.endsWith(".zip") && n.includes("extension")) urls.chrome = u;
        });
        setRelease({
          tag: data.tag_name,
          name: data.name,
          url: data.html_url,
          published_at: data.published_at,
          platform_urls: urls,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!release) return null;

  const entries: { key: string; label: string; icon: React.ReactNode }[] = [
    { key: "mac_arm64", label: "Mac (Apple Silicon)", icon: <Apple className="h-4 w-4" /> },
    { key: "mac_x64", label: "Mac (Intel)", icon: <Apple className="h-4 w-4" /> },
    { key: "windows", label: "Windows", icon: <Monitor className="h-4 w-4" /> },
    { key: "linux", label: "Linux (AppImage)", icon: <Monitor className="h-4 w-4" /> },
    { key: "android", label: "Android (APK)", icon: <Smartphone className="h-4 w-4" /> },
    { key: "chrome", label: "Chrome Extension", icon: <Chrome className="h-4 w-4" /> },
  ];

  const available = entries.filter((e) => release.platform_urls?.[e.key]);

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold">Latest release</h2>
          <p className="text-sm text-muted-foreground">
            {release.name || release.tag} · Released {fmtDate(release.published_at)}
          </p>
        </div>
        <Badge variant="secondary">{release.tag}</Badge>
      </div>

      {available.length === 0 ? (
        <p className="text-sm text-muted-foreground">No downloadable assets yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {available.map((e) => (
            <Button
              key={e.key}
              variant="outline"
              asChild
              className="justify-start"
            >
              <a href={release.platform_urls[e.key]} target="_blank" rel="noopener noreferrer">
                {e.icon}
                <span className="ml-2">{e.label}</span>
                <Download className="h-4 w-4 ml-auto" />
              </a>
            </Button>
          ))}
        </div>
      )}

      {release.url && (
        <a
          href={release.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline"
        >
          View full release notes on GitHub →
        </a>
      )}
    </Card>
  );
}
