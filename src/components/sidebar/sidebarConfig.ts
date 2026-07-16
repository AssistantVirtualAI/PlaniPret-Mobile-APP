import {
  TrendingUp, MessageSquare, BarChart3, BookOpen,
  Bot, Sparkles, FileQuestion, Users, UserPlus, Calendar,
  Phone, MessageCircle, GitBranch, Sliders, Webhook,
  CreditCard, Settings, Tag, Headphones, LayoutDashboard, Globe,
  Shield, PhoneCall, Voicemail, Smartphone, Disc, Bell, Brain, Router, Activity, Home, Download, Inbox, Server, Building2, Network
} from 'lucide-react';

export interface NavItem {
  nameKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  hideForLemtel?: boolean;
}

export interface NavGroup {
  id: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  lemtelOnly?: boolean;
  lemtelCustomerOnly?: boolean;
  hideForLemtel?: boolean;
  /** Show only when selectedOrgId matches Planipret */
  planipretOnly?: boolean;
  /** scope controls where this group appears */
  scope?: 'org' | 'my' | 'legacy' | 'platform' | 'customer';
}

// =========================================================================
// LEGACY (AVA Main) sidebar — shown when NOT on /org/<slug>/ routes
// =========================================================================
const LEGACY_GROUPS: NavGroup[] = [
  {
    id: 'overview', labelKey: 'sidebar.dashboard', icon: TrendingUp, scope: 'legacy',
    items: [{ nameKey: 'sidebar.dashboard', href: '/dashboard', icon: TrendingUp }],
  },
  {
    id: 'conversations', labelKey: 'sidebar.groups.conversations', icon: MessageSquare, scope: 'legacy',
    items: [
      { nameKey: 'sidebar.conversationsList', href: '/conversations', icon: MessageSquare },
      { nameKey: 'sidebar.voiceAnalytics', href: '/analytics', icon: BarChart3 },
      { nameKey: 'sidebar.handoffs', href: '/handoffs', icon: Headphones },
      { nameKey: 'sidebar.topics', href: '/topics', icon: Tag },
    ],
  },
  {
    id: 'agents', labelKey: 'sidebar.groups.agents', icon: Bot, adminOnly: true, scope: 'legacy',
    items: [
      { nameKey: 'sidebar.agentsList', href: '/agents', icon: Bot },
      { nameKey: 'sidebar.agentBuilder', href: '/agent-builder', icon: Sparkles },
      { nameKey: 'sidebar.agentReports', href: '/agent-reports', icon: FileQuestion },
      { nameKey: 'sidebar.knowledgeBase', href: '/knowledge-base', icon: BookOpen },
      { nameKey: 'sidebar.clients', href: '/clients', icon: Users },
    ],
  },
  {
    id: 'crm', labelKey: 'sidebar.groups.crm', icon: Users, adminOnly: true, hideForLemtel: true, scope: 'legacy',
    items: [
      { nameKey: 'sidebar.leads', href: '/leads', icon: UserPlus },
      { nameKey: 'sidebar.appointments', href: '/appointments', icon: Calendar },
    ],
  },
  {
    id: 'campaigns', labelKey: 'sidebar.groups.campaigns', icon: Phone, adminOnly: true, scope: 'legacy',
    items: [
      { nameKey: 'sidebar.campaignsList', href: '/campaigns', icon: Phone },
      
      { nameKey: 'sidebar.smsTemplates', href: '/sms-templates', icon: MessageCircle },
    ],
  },
  {
    id: 'config', labelKey: 'sidebar.groups.config', icon: Sliders, adminOnly: true, scope: 'legacy',
    items: [
      { nameKey: 'sidebar.workflows', href: '/workflows', icon: GitBranch },
      { nameKey: 'sidebar.integrations', href: '/integrations', icon: Sliders },
      { nameKey: 'sidebar.webhookLogs', href: '/webhook-logs', icon: Webhook },
      { nameKey: 'Audit Logs', href: '/audit-logs', icon: Shield },
      { nameKey: 'sidebar.apiExplorer', href: '/api-explorer', icon: Globe },
    ],
  },
  {
    id: 'billing', labelKey: 'sidebar.groups.billing', icon: CreditCard, adminOnly: true, hideForLemtel: true, scope: 'legacy',
    items: [
      { nameKey: 'sidebar.stripeBilling', href: '/stripe-billing', icon: CreditCard },
      { nameKey: 'sidebar.saasConfig', href: '/saas-config', icon: Settings },
    ],
  },
];

// =========================================================================
// ORG sidebar — shown on /org/<slug>/ (excluding /my/)
// =========================================================================
const ORG_GROUPS: NavGroup[] = [
  {
    id: 'org-dashboard', labelKey: 'Dashboard', icon: LayoutDashboard, scope: 'org', lemtelOnly: true,
    items: [{ nameKey: 'Dashboard', href: '/org/lemtel/admin/dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'org-phone-system', labelKey: '📞 Phone System', icon: PhoneCall, scope: 'org', lemtelOnly: true,
    items: [
      { nameKey: 'Extensions', href: '/org/lemtel/admin/extensions', icon: Smartphone },
      { nameKey: 'PBX Users', href: '/org/lemtel/admin/pbx-users', icon: Users },
      { nameKey: 'Devices', href: '/org/lemtel/admin/devices', icon: Router },
      { nameKey: 'Inbound Routes', href: '/org/lemtel/admin/destinations', icon: Phone },
      { nameKey: 'Time Conditions', href: '/org/lemtel/admin/time-conditions', icon: Bell },
      { nameKey: 'IVR / Auto-Attendant', href: '/org/lemtel/admin/ivr', icon: Voicemail },
      { nameKey: 'Ring Groups', href: '/org/lemtel/admin/ring-groups', icon: Bell },
      { nameKey: 'Gateways', href: '/org/lemtel/admin/gateways', icon: Network },
      { nameKey: 'Voice Gateways', href: '/org/lemtel/admin/voice-gateways', icon: Network },
      { nameKey: 'SIP Profiles', href: '/org/lemtel/admin/sip-profiles', icon: Server },
      { nameKey: 'Dialplans', href: '/org/lemtel/admin/dialplans', icon: GitBranch },
      { nameKey: 'Feature Codes', href: '/org/lemtel/admin/feature-codes', icon: Sliders },
      { nameKey: 'Call Forwarding', href: '/org/lemtel/admin/call-forwarding', icon: Router },
      { nameKey: 'Voice Agents', href: '/org/lemtel/admin/agents', icon: Bot },
      { nameKey: 'Agent Conversations', href: '/org/lemtel/admin/conversations', icon: MessageSquare },
      { nameKey: 'Customers', href: '/org/lemtel/admin/customers', icon: Users },
      { nameKey: 'PBX Settings', href: '/org/lemtel/admin/settings', icon: Settings },
    ],
  },
  {
    id: 'org-call-center', labelKey: '🎧 Call Center', icon: Headphones, scope: 'org', lemtelOnly: true,
    items: [
      { nameKey: 'Call Queues', href: '/org/lemtel/admin/queues', icon: Headphones },
      { nameKey: 'Queue Agents', href: '/org/lemtel/admin/queues', icon: Users },
      { nameKey: 'Conferences', href: '/org/lemtel/admin/conferences', icon: Users },
      { nameKey: 'Music on Hold', href: '/org/lemtel/admin/hold-music', icon: Headphones },
      { nameKey: 'Recording Rules', href: '/org/lemtel/admin/recording-rules', icon: Disc },
      { nameKey: 'Voicemail Settings', href: '/org/lemtel/admin/voicemail-settings', icon: Voicemail },
      { nameKey: 'Wallboard', href: '/org/lemtel/callcenter/wallboard', icon: Activity },
      { nameKey: 'Agent Console', href: '/org/lemtel/callcenter/agent', icon: Phone },
      { nameKey: 'CC Admin', href: '/org/lemtel/callcenter/admin', icon: Shield },
      { nameKey: 'Telephony QA', href: '/org/lemtel/telephony/qa', icon: Activity },
    ],
  },
  {
    id: 'org-analytics', labelKey: '📈 Analytics', icon: BarChart3, scope: 'org', lemtelOnly: true,
    items: [
      { nameKey: 'Media Center', href: '/org/lemtel/telephony/media', icon: Disc },
      { nameKey: 'Call History', href: '/org/lemtel/admin/calls', icon: PhoneCall },
      { nameKey: 'Recordings', href: '/org/lemtel/admin/recordings', icon: Disc },
      { nameKey: 'AI Insights', href: '/org/lemtel/telephony/ai', icon: Brain },
      { nameKey: 'Reports', href: '/org/lemtel/admin/reports', icon: FileQuestion },
    ],
  },
  {
    id: 'org-communications', labelKey: '💬 Communications', icon: MessageSquare, scope: 'org', lemtelOnly: true,
    items: [
      { nameKey: 'Messages (SMS)', href: '/org/lemtel/telephony/messages', icon: MessageSquare },
      { nameKey: 'Voicemail', href: '/org/lemtel/admin/voicemail', icon: Voicemail },
      { nameKey: 'Team Chat', href: '/org/lemtel/telephony/team', icon: Users },
    ],
  },
  {
    id: 'org-monitoring', labelKey: '🩺 Monitoring', icon: Activity, scope: 'org', lemtelOnly: true,
    items: [
      { nameKey: 'Active Calls', href: '/org/lemtel/admin/active-calls', icon: PhoneCall },
      { nameKey: 'Registrations', href: '/org/lemtel/admin/registrations', icon: Network },
      { nameKey: 'System Status', href: '/org/lemtel/admin/system-status', icon: Activity },
      { nameKey: 'PBX Sync Health', href: '/org/lemtel/admin/sync-health', icon: Activity },
      { nameKey: 'AI Actions Audit', href: '/org/lemtel/admin/ai-actions', icon: Shield },
    ],
  },
  {
    id: 'org-admin', labelKey: '⚙️ Administration', icon: Settings, scope: 'org', lemtelOnly: true,
    items: [
      { nameKey: 'Users & Access', href: '/org/lemtel/telephony/users', icon: Users },
      { nameKey: 'Download Apps', href: '/org/lemtel/admin/downloads', icon: Download },
      { nameKey: 'PBX Advanced', href: '/org/lemtel/telephony/advanced', icon: Shield },
      { nameKey: 'Sync Health', href: '/org/lemtel/telephony/sync-health', icon: Activity },
      { nameKey: 'Settings', href: '/org/lemtel/admin/settings', icon: Settings },
    ],
  },
];

// =========================================================================
// MY (User Workspace) sidebar — shown on /org/<slug>/my/
// =========================================================================
const MY_GROUPS: NavGroup[] = [
  {
    id: 'my-workspace', labelKey: '🏠 My Workspace', icon: Home, scope: 'my', lemtelOnly: true,
    items: [
      { nameKey: 'My Dashboard', href: '/my', icon: Home },
      { nameKey: 'My Extension', href: '/my/settings', icon: Phone },
      { nameKey: 'My Calls', href: '/my/calls', icon: PhoneCall },
      { nameKey: 'My Recordings', href: '/my/recordings', icon: Disc },
      { nameKey: 'My Voicemail', href: '/my/voicemail', icon: Voicemail },
      { nameKey: 'My Messages', href: '/my/messages', icon: Inbox },
      { nameKey: 'Voicemail Greetings', href: '/my/greetings', icon: Voicemail },
      { nameKey: 'Download Apps', href: '/my/downloads', icon: Download },
      { nameKey: 'My Settings', href: '/my/settings', icon: Settings },
    ],
  },
];

// =========================================================================
// PLANIPRET sidebar — shown only when Planipret org is selected
// =========================================================================
const PLANIPRET_GROUPS: NavGroup[] = [
  {
    id: 'planipret', labelKey: '🏠 Planiprêt', icon: LayoutDashboard, scope: 'legacy', planipretOnly: true,
    items: [
      { nameKey: "Vue d'ensemble", href: '/planipret/admin/overview', icon: LayoutDashboard },
      { nameKey: 'Courtiers', href: '/planipret/admin/users', icon: Users },
      { nameKey: 'Appels', href: '/planipret/admin/calls', icon: Phone },
      { nameKey: 'Messages', href: '/planipret/admin/messages', icon: MessageSquare },
      { nameKey: 'Voicemails', href: '/planipret/admin/voicemails', icon: Voicemail },
      { nameKey: 'Leads', href: '/planipret/admin/leads', icon: UserPlus },
      { nameKey: 'Rapports', href: '/planipret/admin/reports', icon: BarChart3 },
      { nameKey: 'Templates SMS', href: '/planipret/admin/templates', icon: MessageCircle },
      { nameKey: 'Intégrations', href: '/planipret/admin/integrations', icon: Sliders },
      { nameKey: 'Conformité', href: '/planipret/admin/compliance', icon: Shield },
      { nameKey: 'Audit système', href: '/planipret/admin/audit-checklist', icon: Shield },
      { nameKey: "Journal d'audit", href: '/planipret/admin/audit', icon: BookOpen },
    ],
  },
];

export const sidebarGroups: NavGroup[] = [...LEGACY_GROUPS, ...PLANIPRET_GROUPS, ...ORG_GROUPS, ...MY_GROUPS];

export function getSidebarScope(pathname: string): 'org' | 'my' | 'legacy' | 'admin' {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname === '/my' || pathname.startsWith('/my/')) return 'my';
  if (/^\/org\/[^/]+\/my(\/|$)/.test(pathname)) return 'my';
  if (pathname.startsWith('/org/')) return 'org';
  return 'legacy';
}

export const settingsLink: NavItem = {
  nameKey: 'sidebar.settings',
  href: '/settings',
  icon: Settings,
};
