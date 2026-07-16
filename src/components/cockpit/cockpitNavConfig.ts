import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Brain,
  Building2,
  ClipboardList,
  Disc,
  FileQuestion,
  Headphones,
  HelpCircle,
  Inbox,
  Key,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  PhoneCall,
  Plug,
  Router,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  Tag,
  Users,
  Voicemail,
  Webhook,
} from "lucide-react";
import type { Role } from "@/lib/permissions";
import type { LiveCounterKey } from "@/hooks/useLiveCounters";

export type CockpitRole = Role | "customer";

export interface CockpitNavItem {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  roles?: CockpitRole[];
  liveBadgeKey?: LiveCounterKey;
}

export interface CockpitNavGroup {
  id: string;
  labelKey: string;
  icon: LucideIcon;
  items: CockpitNavItem[];
  roles?: CockpitRole[];
}

/**
 * Phase 2 cockpit navigation tree.
 * - Additive: lives alongside legacy `sidebarConfig.ts`. Nothing here removes
 *   or shadows existing routes; every `href` already exists in `src/App.tsx`.
 * - Role visibility is enforced at render time via `useRoleMenu()`.
 * - Live badges read from `useLiveCounters()` and stay hidden when the value
 *   is zero, so the layer is silent until Phase 5 data lands.
 */
export const COCKPIT_NAV: CockpitNavGroup[] = [
  {
    id: "command-center",
    labelKey: "cockpit.nav.commandCenter",
    icon: LayoutDashboard,
    roles: ["super_admin", "org_admin", "manager"],
    items: [
      { labelKey: "cockpit.nav.overview", href: "/platform", icon: LayoutDashboard, roles: ["super_admin", "org_admin"] },
      { labelKey: "cockpit.nav.liveCalls", href: "/org/lemtel/callcenter/wallboard", icon: PhoneCall, liveBadgeKey: "activeCalls" },
      { labelKey: "cockpit.nav.alerts", href: "/platform/system", icon: AlertTriangle, liveBadgeKey: "alerts", roles: ["super_admin", "org_admin"] },
    ],
  },
  {
    id: "telecom",
    labelKey: "cockpit.nav.telecom",
    icon: Router,
    roles: ["super_admin", "org_admin"],
    items: [
      { labelKey: "cockpit.nav.extensions", href: "/org/lemtel/admin/extensions", icon: Smartphone },
      { labelKey: "cockpit.nav.devices", href: "/org/lemtel/admin/devices", icon: Router },
      { labelKey: "cockpit.nav.numbers", href: "/org/lemtel/admin/dids", icon: PhoneCall },
      { labelKey: "cockpit.nav.ivr", href: "/org/lemtel/admin/ivr", icon: Voicemail },
      { labelKey: "cockpit.nav.routing", href: "/org/lemtel/admin/settings", icon: Settings },
    ],
  },
  {
    id: "ai-voice",
    labelKey: "cockpit.nav.aiVoice",
    icon: Brain,
    items: [
      { labelKey: "cockpit.nav.voicemail", href: "/org/lemtel/admin/voicemail", icon: Voicemail, liveBadgeKey: "unreadVoicemail" },
      { labelKey: "cockpit.nav.transcripts", href: "/org/lemtel/telephony/ai", icon: ClipboardList },
      { labelKey: "cockpit.nav.aiInsights", href: "/org/lemtel/telephony/ai", icon: Sparkles },
      { labelKey: "cockpit.nav.handoffs", href: "/handoffs", icon: Headphones, liveBadgeKey: "handoffs" },
    ],
  },
  {
    id: "crm",
    labelKey: "cockpit.nav.crm",
    icon: Users,
    roles: ["super_admin", "org_admin", "manager", "agent"],
    items: [
      { labelKey: "cockpit.nav.contacts", href: "/clients", icon: Users },
      { labelKey: "cockpit.nav.leads", href: "/leads", icon: Tag },
      { labelKey: "cockpit.nav.appointments", href: "/appointments", icon: ClipboardList },
      { labelKey: "cockpit.nav.conversations", href: "/conversations", icon: MessageSquare },
    ],
  },
  {
    id: "reports",
    labelKey: "cockpit.nav.reports",
    icon: BarChart3,
    items: [
      { labelKey: "cockpit.nav.callHistory", href: "/org/lemtel/telephony/calls", icon: PhoneCall },
      { labelKey: "cockpit.nav.recordings", href: "/org/lemtel/admin/recordings", icon: Disc },
      { labelKey: "cockpit.nav.reportsHub", href: "/org/lemtel/admin/reports", icon: FileQuestion },
      { labelKey: "cockpit.nav.analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    id: "administration",
    labelKey: "cockpit.nav.administration",
    icon: Shield,
    roles: ["super_admin", "org_admin"],
    items: [
      { labelKey: "cockpit.nav.users", href: "/org/lemtel/telephony/users", icon: Users },
      { labelKey: "cockpit.nav.organizations", href: "/platform/organizations", icon: Building2, roles: ["super_admin"] },
      { labelKey: "cockpit.nav.permissions", href: "/platform/settings", icon: Key },
      { labelKey: "cockpit.nav.integrations", href: "/integrations", icon: Plug },
      { labelKey: "cockpit.nav.webhooks", href: "/webhook-logs", icon: Webhook },
      { labelKey: "cockpit.nav.audit", href: "/audit-logs", icon: Shield },
      { labelKey: "cockpit.nav.aiAdmin", href: "/admin/ava", icon: Bot, roles: ["super_admin", "org_admin"] },
    ],
  },
  {
    id: "support",
    labelKey: "cockpit.nav.support",
    icon: LifeBuoy,
    items: [
      { labelKey: "cockpit.nav.inbox", href: "/handoffs", icon: Inbox },
      { labelKey: "cockpit.nav.docs", href: "/docs", icon: HelpCircle },
      { labelKey: "cockpit.nav.systemStatus", href: "/platform/system", icon: Activity, roles: ["super_admin", "org_admin"] },
    ],
  },
];

export function filterCockpitNav(nav: CockpitNavGroup[], role: CockpitRole | null | undefined): CockpitNavGroup[] {
  if (!role) return [];
  return nav
    .filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.roles || it.roles.includes(role)) }))
    .filter((g) => g.items.length > 0);
}
