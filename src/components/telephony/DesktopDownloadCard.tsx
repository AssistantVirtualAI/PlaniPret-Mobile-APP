import { useEffect, useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const REPO = "AssistantVirtualAI/attach-app-creator";
const BASE = `https://github.com/${REPO}/releases/latest/download`;
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;

export type DownloadItem = {
  platform: string;
  icon: string;
  label: string;
  sublabel: string;
  url: string;
  badge: string;
  color: string;
};

export const downloads: DownloadItem[] = [
  {
    platform: "Windows",
    icon: "🪟",
    label: "Download for Windows",
    sublabel: "Windows 10+ · 64-bit · Auto-installer",
    url: `${BASE}/Lemtel.Telecom.Setup.exe`,
    badge: ".exe",
    color: "#0078D4",
  },
  {
    platform: "Mac Apple Silicon",
    icon: "🍎",
    label: "Download for Mac (M1/M2/M3/M4)",
    sublabel: "macOS 11+ · Apple Silicon",
    url: `${BASE}/Lemtel.Telecom-arm64.dmg`,
    badge: ".dmg",
    color: "#555555",
  },
  {
    platform: "Mac Intel",
    icon: "🍎",
    label: "Download for Mac (Intel)",
    sublabel: "macOS 11+ · Intel",
    url: `${BASE}/Lemtel.Telecom.dmg`,
    badge: ".dmg",
    color: "#555555",
  },
  {
    platform: "Linux",
    icon: "🐧",
    label: "Download for Linux",
    sublabel: "All distributions · AppImage",
    url: `${BASE}/Lemtel.Telecom.AppImage`,
    badge: ".AppImage",
    color: "#E95420",
  },
  {
    platform: "Linux Debian",
    icon: "🐧",
    label: "Download for Linux (Debian/Ubuntu)",
    sublabel: "Ubuntu 20.04+ · .deb package",
    url: `${BASE}/Lemtel.Telecom.deb`,
    badge: ".deb",
    color: "#A80030",
  },
];

type Asset = { name: string; url: string; size: string };

export function useLatestRelease() {
  const [info, setInfo] = useState<{ version: string; date: string; assets: Asset[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(API_LATEST)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setInfo({
          version: data.tag_name,
          date: new Date(data.published_at).toLocaleDateString("fr-CA"),
          assets:
            data.assets?.map((a: any) => ({
              name: a.name,
              url: a.browser_download_url,
              size: (a.size / 1024 / 1024).toFixed(1) + " MB",
            })) || [],
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return info;
}

export function DesktopDownloadCard() {
  const info = useLatestRelease();

  const sizeFor = (url: string) => {
    const fileName = url.split("/").pop();
    return info?.assets.find((a) => a.name === fileName)?.size;
  };

  const requirements = [
    "Windows 10+ (64-bit)",
    "macOS 11+ (Intel or Apple Silicon)",
    "Ubuntu 20.04+ / Debian 11+",
    "Microphone required for calls",
    "Internet connection required",
    "Auto-updates included",
  ];

  return (
    <Card className="p-6 bg-gradient-to-br from-primary/10 to-background border-primary/20">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">Download Lemtel Telecom</h3>
            {info ? (
              <Badge variant="secondary">Latest {info.version}</Badge>
            ) : (
              <Badge variant="outline">Latest version</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {info
              ? `Latest version: ${info.version} — ${info.date}`
              : "Native softphone for Windows, macOS, and Linux. Auto-updates included."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {downloads.map((d) => {
          const size = sizeFor(d.url);
          return (
            <Button
              key={d.platform}
              asChild
              variant="default"
              className="h-auto py-3 px-4 justify-start gap-3"
            >
              <a href={d.url} download>
                <span className="text-xl" aria-hidden>{d.icon}</span>
                <div className="flex flex-col items-start text-left flex-1">
                  <span className="text-sm font-medium">{d.label}</span>
                  <span className="text-xs opacity-80">
                    {d.sublabel}
                    {size ? ` · ${size}` : ""}
                  </span>
                </div>
                <Download className="h-4 w-4 opacity-70" />
              </a>
            </Button>
          );
        })}
      </div>

      <div className="mt-5 pt-4 border-t border-border">
        <div className="text-sm font-medium mb-2">System requirements</div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4 text-xs text-muted-foreground">
          {requirements.map((r) => (
            <li key={r} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
