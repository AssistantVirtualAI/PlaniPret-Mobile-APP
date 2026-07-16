import { supabase } from "@/integrations/supabase/client";

export interface PlanFeatures {
  callCenter: boolean;
  aiInsights: boolean;
  smsMessaging: boolean;
  callRecording: boolean;
  teamChat: boolean;
  videoCall: boolean;
  crmIntegration: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  customDomain: boolean;
}

export interface WhitelabelConfig {
  orgId: string;
  orgSlug: string;
  orgName: string;
  appName: string;
  portalName: string;
  logoUrl?: string;
  faviconUrl?: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  supportEmail: string;
  supportPhone?: string;
  website?: string;
  customDomain?: string;
  downloadPageUrl: string;
  billingPlan: string;
  orgType: string;
  orgLevel: number;
  features: PlanFeatures;
}

const DEFAULT_FEATURES: PlanFeatures = {
  callCenter: false,
  aiInsights: false,
  smsMessaging: true,
  callRecording: true,
  teamChat: true,
  videoCall: false,
  crmIntegration: false,
  apiAccess: false,
  whiteLabel: false,
  customDomain: false,
};

export function getDefaultWhitelabel(): WhitelabelConfig {
  return {
    orgId: "",
    orgSlug: "",
    orgName: "AVA Statistic",
    appName: "AVA Statistic",
    portalName: "AVA Statistic Portal",
    primaryColor: "#0023e6",
    accentColor: "#FFD700",
    backgroundColor: "#050816",
    supportEmail: "support@assistantvirtualai.com",
    downloadPageUrl: "/download",
    billingPlan: "basic",
    orgType: "customer",
    orgLevel: 2,
    features: DEFAULT_FEATURES,
  };
}

export async function getPlanFeatures(plan: string): Promise<PlanFeatures> {
  const { data } = await supabase
    .from("billing_plans" as any)
    .select("features")
    .eq("id", plan)
    .maybeSingle();
  return { ...DEFAULT_FEATURES, ...((data as any)?.features ?? {}) };
}

export async function loadWhitelabel(orgIdOrSlug: string): Promise<WhitelabelConfig> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrSlug);
  const { data } = await supabase
    .from("organizations")
    .select("id,slug,name,brand_app_name,brand_name,brand_logo_url,brand_favicon_url,brand_primary_color,brand_accent_color,brand_support_email,billing_plan")
    .eq(isUuid ? "id" : "slug", orgIdOrSlug)
    .maybeSingle();
  if (!data) return getDefaultWhitelabel();
  const d = data as any;
  const features = await getPlanFeatures(d.billing_plan || "basic");
  return {
    orgId: d.id,
    orgSlug: d.slug,
    orgName: d.name,
    appName: d.brand_app_name || d.brand_name || "Lemtel Telecom",
    portalName: d.brand_name ? `${d.brand_name} Portal` : "AVA Statistic",
    logoUrl: d.brand_logo_url || undefined,
    faviconUrl: d.brand_favicon_url || undefined,
    primaryColor: d.brand_primary_color || "#0023e6",
    accentColor: d.brand_accent_color || "#FFD700",
    backgroundColor: "#050816",
    supportEmail: d.brand_support_email || "support@assistantvirtualai.com",
    supportPhone: d.brand_support_phone || undefined,
    website: d.brand_website || undefined,
    customDomain: d.brand_portal_domain || undefined,
    downloadPageUrl: d.brand_portal_domain
      ? `https://${d.brand_portal_domain}/download`
      : `/download/${d.slug}`,
    billingPlan: d.billing_plan || "basic",
    orgType: d.org_type || "customer",
    orgLevel: d.org_level ?? 2,
    features,
  };
}

function hexToHslTuple(hex: string): string {
  const m = hex.replace("#", "");
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
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyWhitelabel(config: WhitelabelConfig) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", config.primaryColor);
  root.style.setProperty("--brand-accent", config.accentColor);
  root.style.setProperty("--brand-bg", config.backgroundColor);
  try {
    root.style.setProperty("--brand-primary-hsl", hexToHslTuple(config.primaryColor));
    root.style.setProperty("--brand-accent-hsl", hexToHslTuple(config.accentColor));
  } catch {}
  if (config.portalName) document.title = config.portalName;
  if (config.faviconUrl) {
    let link = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = config.faviconUrl;
  }
}
