// Resolves latest desktop app release assets from GitHub by regex matching,
// so renamed artifacts don't 404.

export type ReleaseAsset = {
  name: string;
  url: string;
  size: number;
};

export type ResolvedRelease = {
  version: string;
  publishedAt: string;
  assets: ReleaseAsset[];
  macArm?: string;
  macIntel?: string;
  windows?: string;
  linuxAppImage?: string;
  linuxDeb?: string;
};

const REPO = "AssistantVirtualAI/attach-app-creator";
const API_LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const BASE = `https://github.com/${REPO}/releases/latest/download`;

// Hard-coded fallback URLs (used if API fails); these may 404 if the release
// uses different filenames — the API path is preferred.
// Hard-coded fallback URLs (used if API fails). Pin to the exact 2.3.14
// asset filenames the publisher confirmed are live on GitHub Releases.
export const FALLBACK_URLS = {
  macArm: `${BASE}/Lemtel.Telecom-2.3.14-arm64.dmg`,
  macIntel: `${BASE}/Lemtel.Telecom-2.3.14.dmg`,
  windows: `${BASE}/Lemtel.Telecom.Setup.2.3.14.exe`,
  linuxAppImage: `${BASE}/Lemtel.Telecom.AppImage`,
  linuxDeb: `${BASE}/Lemtel.Telecom.deb`,
};

export async function fetchLatestRelease(): Promise<ResolvedRelease | null> {
  try {
    const r = await fetch(API_LATEST);
    if (!r.ok) return null;
    const data = await r.json();
    const assets: ReleaseAsset[] = (data.assets || []).map((a: any) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
    }));

    const find = (re: RegExp) => assets.find((a) => re.test(a.name))?.url;

    return {
      version: data.tag_name,
      publishedAt: data.published_at,
      assets,
      macArm: find(/arm64.*\.dmg$/i),
      macIntel: find(/^(?!.*arm64).*\.dmg$/i),
      windows: find(/\.exe$/i),
      linuxAppImage: find(/\.AppImage$/i),
      linuxDeb: find(/\.deb$/i),
    };
  } catch {
    return null;
  }
}

export function resolveUrl(
  release: ResolvedRelease | null,
  key: keyof typeof FALLBACK_URLS,
): string {
  return (release && (release as any)[key]) || FALLBACK_URLS[key];
}
