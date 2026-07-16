import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type BrandingSurface = 'admin' | 'client';

function hexToHsl(hex: string): string | null {
  const m = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function setFavicon(url: string) {
  // Remove ALL existing icon links so the browser picks up the new one
  document.querySelectorAll("link[rel~='icon']").forEach((l) => l.parentElement?.removeChild(l));
  const link = document.createElement('link');
  link.rel = 'icon';
  // Cache-bust so the browser refreshes immediately
  link.href = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
  document.head.appendChild(link);
}

interface Resolved {
  primary_color?: string | null;
  favicon_url?: string | null;
  logo_url?: string | null;
  title?: string | null;
}

function pickOrg(org: any, surface: BrandingSurface): Resolved {
  if (surface === 'client') {
    return {
      primary_color: org?.client_portal_primary_color || org?.primary_color,
      favicon_url: org?.client_portal_favicon_url || org?.favicon_url,
      logo_url: org?.client_portal_logo_url || org?.logo_url,
      title: org?.client_portal_title || org?.website_title || org?.name,
    };
  }
  return {
    primary_color: org?.primary_color,
    favicon_url: org?.favicon_url,
    logo_url: org?.logo_url,
    title: org?.website_title || org?.name,
  };
}

function pickPlatform(p: any, surface: BrandingSurface): Resolved {
  if (!p) return {};
  if (surface === 'client') {
    return {
      primary_color: p.client_portal_primary_color || p.primary_color,
      favicon_url: p.client_portal_favicon_url || p.favicon_url,
      logo_url: p.client_portal_logo_url || p.logo_url,
      title: p.client_portal_title || p.website_title,
    };
  }
  return {
    primary_color: p.primary_color,
    favicon_url: p.favicon_url,
    logo_url: p.logo_url,
    title: p.website_title,
  };
}

/**
 * Applies branding (primary color, favicon, title) for the given surface.
 * Per-organization branding wins; platform-wide branding is the fallback.
 */
export function useApplyBranding(
  organizationId: string | null | undefined,
  surface: BrandingSurface = 'admin',
) {
  useEffect(() => {
    let cancelled = false;
    const root = document.documentElement;
    const originalPrimary = root.style.getPropertyValue('--primary');
    const originalTitle = document.title;
    const originalFavicon = (document.querySelector("link[rel~='icon']") as HTMLLinkElement | null)?.href;

    (async () => {
      const [orgRes, platformRes] = await Promise.all([
        organizationId
          ? supabase
              .from('organizations')
              .select(
                'name, primary_color, favicon_url, logo_url, website_title, client_portal_primary_color, client_portal_favicon_url, client_portal_logo_url, client_portal_title',
              )
              .eq('id', organizationId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('platform_branding')
          .select(
            'primary_color, favicon_url, logo_url, website_title, client_portal_primary_color, client_portal_favicon_url, client_portal_logo_url, client_portal_title',
          )
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const orgPick = pickOrg(orgRes.data, surface);
      const platformPick = pickPlatform(platformRes.data, surface);

      const primary = orgPick.primary_color || platformPick.primary_color;
      const favicon = orgPick.favicon_url || platformPick.favicon_url;
      const title = orgPick.title || platformPick.title;

      if (primary) {
        const hsl = hexToHsl(primary);
        if (hsl) root.style.setProperty('--primary', hsl);
      }
      if (favicon) setFavicon(favicon);
      if (title) document.title = title;
    })();

    return () => {
      cancelled = true;
      if (originalPrimary) root.style.setProperty('--primary', originalPrimary);
      else root.style.removeProperty('--primary');
      if (originalTitle) document.title = originalTitle;
      if (originalFavicon) setFavicon(originalFavicon);
    };
  }, [organizationId, surface]);
}
