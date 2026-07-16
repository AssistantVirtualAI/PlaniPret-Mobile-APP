import { Suspense, lazy, useEffect } from "react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { OrganizationProvider, useOrganization } from "@/context/OrganizationContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { ClientProvider } from "@/context/ClientContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { AppErrorBoundary } from "@/components/errors/AppErrorBoundary";


const Landing = lazyWithRetry(() => import("./pages/Landing"));
const AuthPage = lazyWithRetry(() => import("./pages/Auth"));
const AgencyHome = lazyWithRetry(() => import("./pages/AgencyHome"));
const PostLoginRedirect = lazyWithRetry(() => import("./pages/PostLoginRedirect"));
// PlanipretLogin removed — auth handled via avastatistic.ca SSO
const PlanipretMobile = lazyWithRetry(() => import("./pages/planipret/PlanipretMobile"));
const StorePreflightPreview = lazyWithRetry(() => import("./pages/planipret/StorePreflightPreview"));
import { AppSeparationGuard } from "./components/auth/AppSeparationGuard";
import { MplanipretGuard } from "./components/auth/MplanipretGuard";
import RouteDebugOverlay from "./components/debug/RouteDebugOverlay";
import { ROUTES, loginWithRedirect } from "./lib/routes";
// Mobile screens — lazy-loaded so the initial /mplanipret shell paints fast.
// Each screen becomes its own chunk; Suspense fallback renders a mobile skeleton.
const MHome = lazyWithRetry(() => import("./pages/planipret/mobile/MHome"));
const MCalls = lazyWithRetry(() => import("./pages/planipret/mobile/MCalls"));
const MMessages = lazyWithRetry(() => import("./pages/planipret/mobile/MMessages"));
const MVoicemail = lazyWithRetry(() => import("./pages/planipret/mobile/MVoicemail"));
const MMore = lazyWithRetry(() => import("./pages/planipret/mobile/MMore"));
const MContacts = lazyWithRetry(() => import("./pages/planipret/mobile/MContacts"));
const MPipeline = lazyWithRetry(() => import("./pages/planipret/mobile/MPipeline"));
const MSearch = lazyWithRetry(() => import("./pages/planipret/mobile/MSearch"));
const MStats = lazyWithRetry(() => import("./pages/planipret/mobile/MStats"));
const MAvaChat = lazyWithRetry(() => import("./pages/planipret/mobile/MAvaChat"));
const MAvaNotifications = lazyWithRetry(() => import("./pages/planipret/mobile/MAvaNotifications"));
const MExtensionSync = lazyWithRetry(() => import("./pages/planipret/mobile/MExtensionSync"));
const PlanipretAudit = lazyWithRetry(() => import("./pages/planipret/PlanipretAudit"));
const Ms365Callback = lazyWithRetry(() => import("./pages/planipret/Ms365Callback"));
const Ms365Diagnostics = lazyWithRetry(() => import("./pages/planipret/Ms365Diagnostics"));
const MStyleDiagnosticsWeb = lazyWithRetry(() => import("./pages/MStyleDiagnosticsWeb"));
const SoftphoneSetup = lazyWithRetry(() => import("./pages/lemtel/SoftphoneSetup"));
// Lazy-load admin pages (each is its own chunk)
const PlanipretAdminLayout = lazyWithRetry(() => import("./pages/planipret/admin/PlanipretAdminLayout"));
const PAOverview = lazyWithRetry(() => import("./pages/planipret/admin/PAOverview"));
const PAUsers = lazyWithRetry(() => import("./pages/planipret/admin/PAUsers"));
const PACalls = lazyWithRetry(() => import("./pages/planipret/admin/PACalls"));
const PAMessages = lazyWithRetry(() => import("./pages/planipret/admin/PAMessages"));
const PAVoicemails = lazyWithRetry(() => import("./pages/planipret/admin/PAVoicemails"));
const PARecordings = lazyWithRetry(() => import("./pages/planipret/admin/PARecordings"));
const PAReports = lazyWithRetry(() => import("./pages/planipret/admin/PAReports"));
const PAAuditLog = lazyWithRetry(() => import("./pages/planipret/admin/PAAuditLog"));
const PAAuditChecklist = lazyWithRetry(() => import("./pages/planipret/admin/PAAuditChecklist"));
const PACompliance = lazyWithRetry(() => import("./pages/planipret/admin/PACompliance"));
const PALeads = lazyWithRetry(() => import("./pages/planipret/admin/PALeads"));
const PATemplates = lazyWithRetry(() => import("./pages/planipret/admin/PATemplates"));
const PADebug = lazyWithRetry(() => import("./pages/planipret/admin/PADebug"));
const PAAva = lazyWithRetry(() => import("./pages/planipret/admin/PAAva"));
const PAAvaAgent = lazyWithRetry(() => import("./pages/planipret/admin/PAAvaAgent"));
const PAAvaLogs = lazyWithRetry(() => import("./pages/planipret/admin/PAAvaLogs"));
const PAMobileDevices = lazyWithRetry(() => import("./pages/planipret/admin/PAMobileDevices"));
const PASipDiagnostic = lazyWithRetry(() => import("./pages/planipret/admin/PASipDiagnostic"));
const PADiagnostics = lazyWithRetry(() => import("./pages/planipret/admin/PADiagnostics"));
const PAMaestroSync = lazyWithRetry(() => import("./pages/planipret/admin/PAMaestroSync"));
const PlanipretPrivacy = lazyWithRetry(() => import("./pages/planipret/PlanipretPrivacy"));
const PlanipretIntegrationsLazy = lazyWithRetry(() => import("./pages/planipret/PlanipretIntegrations"));
import { AdminPageSkeleton, MobilePageSkeleton } from "./components/planipret/Skeletons";

const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const VoiceAnalytics = lazyWithRetry(() => import("./pages/VoiceAnalytics"));
const Conversations = lazyWithRetry(() => import("./pages/Conversations"));
const ConversationDetail = lazyWithRetry(() => import("./pages/ConversationDetail"));
const KnowledgeBase = lazyWithRetry(() => import("./pages/KnowledgeBase"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Clients = lazyWithRetry(() => import("./pages/Clients"));
const ClientCreateWizard = lazyWithRetry(() => import("./pages/admin/ClientCreateWizard"));
const Integrations = lazyWithRetry(() => import("./pages/Integrations"));
const WebhookLogs = lazyWithRetry(() => import("./pages/WebhookLogs"));
const StripeBilling = lazyWithRetry(() => import("./pages/StripeBilling"));
const SaaSConfigurator = lazyWithRetry(() => import("./pages/SaaSConfigurator"));
const EmailTemplates = lazyWithRetry(() => import("./pages/EmailTemplates"));
const Agents = lazyWithRetry(() => import("./pages/Agents"));
const AgentSettings = lazyWithRetry(() => import("./pages/AgentSettings"));
const Workflows = lazyWithRetry(() => import("./pages/Workflows"));
const WorkflowBuilder = lazyWithRetry(() => import("./pages/WorkflowBuilder"));
const Team = lazyWithRetry(() => import("./pages/Team"));
const ApiKeys = lazyWithRetry(() => import("./pages/ApiKeys"));
const ClientDetail = lazyWithRetry(() => import("./pages/ClientDetail"));
const ClientLogin = lazyWithRetry(() => import("./pages/ClientLogin"));
const ClientForgotPassword = lazyWithRetry(() => import("./pages/ClientForgotPassword"));
const ClientResetPassword = lazyWithRetry(() => import("./pages/ClientResetPassword"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const ClientPortal = lazyWithRetry(() => import("./pages/ClientPortal"));
const ClientAgentPortal = lazyWithRetry(() => import("./pages/ClientAgentPortal"));
const ClientConversations = lazyWithRetry(() => import("./pages/ClientConversations"));
const ClientAnalytics = lazyWithRetry(() => import("./pages/ClientAnalytics"));
const ClientAgentDashboard = lazyWithRetry(() => import("./pages/ClientAgentDashboard"));
const ClientAgentConversations = lazyWithRetry(() => import("./pages/ClientAgentConversations"));
const ClientAgentAnalytics = lazyWithRetry(() => import("./pages/ClientAgentAnalytics"));
const ClientAgentKnowledge = lazyWithRetry(() => import("./pages/ClientAgentKnowledge"));
const ClientAgentSettings = lazyWithRetry(() => import("./pages/ClientAgentSettings"));
const ClientAgentEndpoints = lazyWithRetry(() => import("./pages/ClientAgentEndpoints"));
const ClientAgentMCP = lazyWithRetry(() => import("./pages/ClientAgentMCP"));
const ClientAgentWebhooks = lazyWithRetry(() => import("./pages/ClientAgentWebhooks"));
const ClientAgentWidget = lazyWithRetry(() => import("./pages/ClientAgentWidget"));
const WidgetPrototype = lazyWithRetry(() => import("./pages/WidgetPrototype"));
const WidgetIframe = lazyWithRetry(() => import("./pages/WidgetIframe"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const Terms = lazyWithRetry(() => import("./pages/Terms"));
const BAAgreement = lazyWithRetry(() => import("./pages/BAAgreement"));
const Legal = lazyWithRetry(() => import("./pages/Legal"));
const Support = lazyWithRetry(() => import("./pages/Support"));
const Docs = lazyWithRetry(() => import("./pages/Docs"));
const Topics = lazyWithRetry(() => import("./pages/Topics"));
const Campaigns = lazyWithRetry(() => import("./pages/Campaigns"));
const Appointments = lazyWithRetry(() => import("./pages/Appointments"));
const AgentReports = lazyWithRetry(() => import("./pages/AgentReports"));
const AgentBuilder = lazyWithRetry(() => import("./pages/AgentBuilder"));
const AgentComparison = lazyWithRetry(() => import("./pages/AgentComparison"));
const Leads = lazyWithRetry(() => import("./pages/Leads"));
const PhoneNumbers = lazyWithRetry(() => import("./pages/PhoneNumbers"));
const Handoffs = lazyWithRetry(() => import("./pages/Handoffs"));
const SmsTemplates = lazyWithRetry(() => import("./pages/SmsTemplates"));
import NotFound from "./pages/NotFound";
const DemoCenter = lazyWithRetry(() => import("./pages/DemoCenter"));
const RealtimeMonitor = lazyWithRetry(() => import("./pages/RealtimeMonitor"));
const ApiExplorer = lazyWithRetry(() => import("./pages/ApiExplorer"));
const SuperAdminDashboard = lazyWithRetry(() => import("./pages/SuperAdminDashboard"));
const TwilioManagement = lazyWithRetry(() => import("./pages/TwilioManagement"));
const FeaturesPage = lazyWithRetry(() => import("./pages/Features"));
const DemoRequestPage = lazyWithRetry(() => import("./pages/DemoRequest"));
const ContactUs = lazyWithRetry(() => import("./pages/ContactUs"));
const AuditLogs = lazyWithRetry(() => import("./pages/AuditLogs"));
const Download = lazyWithRetry(() => import("./pages/Download"));
const MobilePreview = lazyWithRetry(() => import("./pages/MobilePreview"));
const MobileEmbed = lazyWithRetry(() => import("./pages/MobileEmbed"));
// Lemtel module
import { LemtelGuard } from "./pages/lemtel/LemtelGuard";
const LemtelDashboard = lazyWithRetry(() => import("./pages/lemtel/LemtelDashboard"));
const PortalDiagnostic = lazyWithRetry(() => import("./pages/lemtel/PortalDiagnostic"));
const LemtelPortalDashboard = lazyWithRetry(() => import("./pages/lemtel/PortalDashboard"));
const LemtelSettings = lazyWithRetry(() => import("./pages/lemtel/LemtelSettings"));
const ProviderCredentials = lazyWithRetry(() => import("./pages/lemtel/ProviderCredentials"));
const LemtelMessages = lazyWithRetry(() => import("./pages/lemtel/LemtelMessages"));
const LemtelPortalCalls = lazyWithRetry(() => import("./pages/lemtel/LemtelPortalCalls"));
const LemtelStub = lazyWithRetry(() => import("./pages/lemtel/LemtelStub"));
const LemtelCustomers = lazyWithRetry(() => import("./pages/lemtel/LemtelCustomers"));
const PortingQueue = lazyWithRetry(() => import("./pages/lemtel/admin/PortingQueue"));
const CustomerDetail = lazyWithRetry(() => import("./pages/lemtel/CustomerDetail"));
const CustomerPortalGate = lazyWithRetry(() => import("./pages/CustomerPortalGate"));
const LemtelGateways = lazyWithRetry(() => import("./pages/lemtel/LemtelGateways"));
const LemtelVoiceGateways = lazyWithRetry(() => import("./pages/lemtel/LemtelVoiceGateways"));
const LemtelExtensions = lazyWithRetry(() => import("./pages/lemtel/LemtelExtensions"));
const LemtelPbxUsers = lazyWithRetry(() => import("./pages/lemtel/LemtelPbxUsers"));
const LemtelDIDs = lazyWithRetry(() => import("./pages/lemtel/LemtelDIDs"));
const LemtelQueues = lazyWithRetry(() => import("./pages/lemtel/LemtelQueues"));
const LemtelIVR = lazyWithRetry(() => import("./pages/lemtel/LemtelIVR"));
const BusinessHours = lazyWithRetry(() => import("./pages/lemtel/BusinessHours"));
const CustomerSettings = lazyWithRetry(() => import("./pages/lemtel/CustomerSettings"));
const LemtelVoiceAgents = lazyWithRetry(() => import("./pages/lemtel/LemtelVoiceAgents"));
const LemtelSoftphoneUsers = lazyWithRetry(() => import("./pages/lemtel/LemtelSoftphoneUsers"));
const LemtelDevices = lazyWithRetry(() => import("./pages/lemtel/LemtelDevices"));
const TelephonyDashboard = lazyWithRetry(() => import("./pages/telephony/TelephonyDashboard"));
const TelephonySettings = lazyWithRetry(() => import("./pages/telephony/TelephonySettings"));
const TelephonyRecordings = lazyWithRetry(() => import("./pages/telephony/TelephonyRecordings"));
const CallIntelligenceDashboard = lazyWithRetry(() => import("./pages/admin/CallIntelligenceDashboard"));
const TelephonyMediaCenter = lazyWithRetry(() => import("./pages/telephony/TelephonyMediaCenter"));
const TelephonyRingGroups = lazyWithRetry(() => import("./pages/telephony/TelephonyRingGroups"));
const TelephonyAI = lazyWithRetry(() => import("./pages/telephony/TelephonyAI"));
const TelephonyWebphone = lazyWithRetry(() => import("./pages/telephony/TelephonyWebphone"));
const TelephonyVoicemail = lazyWithRetry(() => import("./pages/telephony/TelephonyVoicemail"));
const TelephonyTeam = lazyWithRetry(() => import("./pages/telephony/TelephonyTeam"));
const TelephonyUserPreferences = lazyWithRetry(() => import("./pages/telephony/TelephonyUserPreferences"));
const CallCenterAgent = lazyWithRetry(() => import("./pages/callcenter/CallCenterAgent"));
const CallCenterWallboard = lazyWithRetry(() => import("./pages/callcenter/CallCenterWallboard"));
const CallCenterAdmin = lazyWithRetry(() => import("./pages/callcenter/CallCenterAdmin"));
const TelephonyDiagnostics = lazyWithRetry(() => import("./pages/telephony/TelephonyDiagnostics"));
const TelephonySourceAudit = lazyWithRetry(() => import("./pages/telephony/TelephonySourceAudit"));
const PhoneNumbersUnified = lazyWithRetry(() => import("./pages/telephony/PhoneNumbersUnified"));
const PbxAdminUsers = lazyWithRetry(() => import("./pages/telephony/PbxAdminUsers"));
const LiveRegistrations = lazyWithRetry(() => import("./pages/telephony/LiveRegistrations"));
const VoiceAgentsLive = lazyWithRetry(() => import("./pages/telephony/VoiceAgentsLive"));
const TelephonyAdvanced = lazyWithRetry(() => import("./pages/telephony/TelephonyAdvanced"));
const TelephonySyncHealth = lazyWithRetry(() => import("./pages/telephony/TelephonySyncHealth"));
const TelephonyChecklist = lazyWithRetry(() => import("./pages/telephony/TelephonyChecklist"));
const TelephonyPortalMappings = lazyWithRetry(() => import("./pages/telephony/TelephonyPortalMappings"));
const TelephonyUsers = lazyWithRetry(() => import("./pages/telephony/TelephonyUsers"));
import { TelephonyLayout } from "./components/telephony/TelephonyLayout";
import { PortalGuard } from "./components/telephony/PortalGuard";
const LemtelAnalytics = lazyWithRetry(() => import("./pages/lemtel/LemtelAnalytics"));
import { AdminPortalLayout, UserPortalLayout } from "./components/portal/LemtelPortalShells";
const AdminDashboard = lazyWithRetry(() => import("./pages/lemtel/admin/AdminDashboard"));
const MyDashboard = lazyWithRetry(() => import("./pages/lemtel/my/MyDashboard"));
const AdminRecordings = lazyWithRetry(() => import("./pages/lemtel/admin/AdminRecordings"));
const AdminVoicemail = lazyWithRetry(() => import("./pages/lemtel/admin/AdminVoicemail"));
import { ConsoleShell } from "./components/console/ConsoleShell";
const ConsoleDashboard = lazyWithRetry(() => import("./pages/console/ConsoleDashboard"));
const ConsoleExtensions = lazyWithRetry(() => import("./pages/console/ConsoleExtensions"));
import {
  ConsoleDevices, ConsoleIVRs, ConsoleQueues, ConsoleRingGroups, ConsoleDIDs,
  ConsoleInboundRoutes, ConsoleVoicemail, ConsoleRegistrations, ConsoleActiveCalls, ConsoleCdr,
} from "./pages/console/ConsoleWrappers";
const ConsoleInsights = lazyWithRetry(() => import("./pages/console/ConsoleInsights"));
const ConsoleChatbot = lazyWithRetry(() => import("./pages/console/ConsoleChatbot"));
const ConsoleAudit = lazyWithRetry(() => import("./pages/console/ConsoleAudit"));
const ConsolePresence = lazyWithRetry(() => import("./pages/console/ConsolePresence"));
const ConsoleChat = lazyWithRetry(() => import("./pages/console/ConsoleChat"));
const AdminReports = lazyWithRetry(() => import("./pages/lemtel/admin/AdminReports"));
const AdminDestinations = lazyWithRetry(() => import("./pages/lemtel/admin/AdminDestinations"));
const AdminTimeConditions = lazyWithRetry(() => import("./pages/lemtel/admin/AdminTimeConditions"));
const AdminConferences = lazyWithRetry(() => import("./pages/lemtel/admin/AdminConferences"));
const AdminHoldMusic = lazyWithRetry(() => import("./pages/lemtel/admin/AdminHoldMusic"));
const AdminSyncHealth = lazyWithRetry(() => import("./pages/lemtel/admin/AdminSyncHealth"));
const AdminSipProfiles = lazyWithRetry(() => import("./pages/lemtel/admin/AdminSipProfiles"));
const AdminDialplans = lazyWithRetry(() => import("./pages/lemtel/admin/AdminDialplans"));
const AdminFeatureCodes = lazyWithRetry(() => import("./pages/lemtel/admin/AdminFeatureCodes"));
const AdminCallForwarding = lazyWithRetry(() => import("./pages/lemtel/admin/AdminCallForwarding"));
const AdminRecordingRules = lazyWithRetry(() => import("./pages/lemtel/admin/AdminRecordingRules"));
const AdminVoicemailSettings = lazyWithRetry(() => import("./pages/lemtel/admin/AdminVoicemailSettings"));
const AdminActiveCalls = lazyWithRetry(() => import("./pages/lemtel/admin/AdminActiveCalls"));
const AdminRegistrations = lazyWithRetry(() => import("./pages/lemtel/admin/AdminRegistrations"));
const AdminSystemStatus = lazyWithRetry(() => import("./pages/lemtel/admin/AdminSystemStatus"));
const AdminAIActions = lazyWithRetry(() => import("./pages/lemtel/admin/AdminAIActions"));
const MySettings = lazyWithRetry(() => import("./pages/lemtel/my/MySettings"));
const MyForwarding = lazyWithRetry(() => import("./pages/lemtel/my/MyForwarding"));
const MyDevices = lazyWithRetry(() => import("./pages/lemtel/my/MyDevices"));
const MyGreetings = lazyWithRetry(() => import("./pages/lemtel/my/MyGreetings"));
import { DownloadCenter } from "./components/portal/DownloadCenter";
import { AppLayout } from "./components/layout/AppLayout";
import CustomerDomainGate from "./components/portal/CustomerDomainGate";
const DomainDashboard = lazyWithRetry(() => import("./pages/lemtel/admin/DomainDashboard"));
// v4.0.0 — Multi-tenant reseller architecture
import { WhitelabelProvider } from "./contexts/WhitelabelContext";
import { ImpersonationProvider } from "./contexts/ImpersonationContext";
import { MasterShell, ResellerShell } from "./components/portal/MasterShells";
const MasterDashboard = lazyWithRetry(() => import("./pages/lemtel/master/MasterDashboard"));
const MasterOrganizations = lazyWithRetry(() => import("./pages/lemtel/master/MasterOrganizations"));
const MasterAllUsers = lazyWithRetry(() => import("./pages/lemtel/master/MasterAllUsers"));
const MasterAllCalls = lazyWithRetry(() => import("./pages/lemtel/master/MasterAllCalls"));
const MasterBilling = lazyWithRetry(() => import("./pages/lemtel/master/MasterBilling"));
const MasterSystem = lazyWithRetry(() => import("./pages/lemtel/master/MasterSystem"));
const MasterAuditLogs = lazyWithRetry(() => import("./pages/lemtel/master/MasterAuditLogs"));
const ResellerDashboard = lazyWithRetry(() => import("./pages/lemtel/reseller/ResellerDashboard"));
const ResellerSettings = lazyWithRetry(() => import("./pages/lemtel/reseller/ResellerSettings"));
// Portal pages
const PortalLogin = lazyWithRetry(() => import("./pages/PortalLogin"));
import PortalLayout from "./components/portal/PortalLayout";
const PortalDashboard = lazyWithRetry(() => import("./pages/PortalDashboard"));
const PortalConversations = lazyWithRetry(() => import("./pages/PortalConversations"));
const PortalAnalytics = lazyWithRetry(() => import("./pages/PortalAnalytics"));
const PortalKnowledge = lazyWithRetry(() => import("./pages/PortalKnowledge"));
const PortalPrompt = lazyWithRetry(() => import("./pages/PortalPrompt"));
const PortalSettings = lazyWithRetry(() => import("./pages/PortalSettings"));
const PortalProfile = lazyWithRetry(() => import("./pages/PortalProfile"));
const UniversalLogin = lazyWithRetry(() => import("./pages/UniversalLogin"));
const EndUserLogin = lazyWithRetry(() => import("./pages/EndUserLogin"));
const PortalChooser = lazyWithRetry(() => import("./pages/PortalChooser"));
// Three-portal architecture (Platform / Customer / My)
import { PlatformAdminShell, CustomerAdminShell } from "./components/portals/PortalShells";
import { MyWorkspaceShellSidebar } from "./components/portals/MyWorkspaceShellSidebar";
const MyTelecomSettings = lazyWithRetry(() => import("./pages/my/TelecomSettings"));
const MyOrgChat = lazyWithRetry(() => import("./pages/my/OrgChat"));
const MyAIAssistant = lazyWithRetry(() => import("./pages/my/AIAssistant"));
const MyVoicemail = lazyWithRetry(() => import("./pages/my/Voicemail"));
const MyGreetingsLibrary = lazyWithRetry(() => import("./pages/my/Greetings"));
const MyRecordings = lazyWithRetry(() => import("./pages/my/Recordings"));
const CustomerAdminAIChat = lazyWithRetry(() => import("./pages/customer/AdminAIChat"));
const CustomerSyncHealth = lazyWithRetry(() => import("./pages/customer/SyncHealthCenter"));
import { RolePortalGuard } from "./components/portals/RolePortalGuard";
import { AVA_STANDALONE_ORG_ID, LEMTEL_ORG_ID, PLANIPRET_ORG_ID } from "./lib/avaOwner";
const PlatformDashboard = lazyWithRetry(() => import("./pages/portals/PlatformDashboard"));
const PlatformSystemHealth = lazyWithRetry(() => import("./pages/platform/SystemHealth"));
const PlatformTelephonyQA = lazyWithRetry(() => import("./pages/platform/TelephonyQA"));
const PlatformAIUsage = lazyWithRetry(() => import("./pages/platform/AIUsage"));
const CustomerDashboard = lazyWithRetry(() => import("./pages/portals/CustomerDashboard"));
const MyDashboardLanding = lazyWithRetry(() => import("./pages/portals/MyDashboardLanding"));
const DesignPreview = lazyWithRetry(() => import("./pages/DesignPreview"));


// SWR-friendly defaults: keep data on screen while revalidating in background,
// dedupe repeated fetches from many components, avoid noisy refetch-on-focus.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

import { TrialExpiredGate } from "./components/billing/TrialExpiredGate";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--gradient-hero)]">
        <div className="text-2xl font-bold gradient-text">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <TrialExpiredGate>{children}</TrialExpiredGate>;
};

const LemtelOrgOnly = ({ children, fallback = "/dashboard" }: { children: React.ReactNode; fallback?: string }) => {
  const { selectedOrgId, isLoading } = useOrganization();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (selectedOrgId !== LEMTEL_ORG_ID) return <Navigate to={fallback} replace />;
  return <>{children}</>;
};

const AvaPlatformOrgOnly = ({ children }: { children: React.ReactNode }) => {
  const { selectedOrgId, organizations, setSelectedOrgId, isLoading } = useOrganization();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (selectedOrgId === AVA_STANDALONE_ORG_ID) return <>{children}</>;
  const isMember = organizations.some((org) => org.id === AVA_STANDALONE_ORG_ID);
  if (isMember) {
    setSelectedOrgId(AVA_STANDALONE_ORG_ID);
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Switching to AVA…</div>;
  }
  return <Navigate to="/login" replace />;
};

/**
 * Restrict the AVA admin portal (the main /dashboard and its sub-routes)
 * to the Planipret organization. If the user is a member of Planipret but
 * has another org selected, auto-switch. Otherwise redirect to /portal.
 */
const PlanipretOrgOnly = ({ children }: { children: React.ReactNode }) => {
  const { selectedOrgId, organizations, setSelectedOrgId, isLoading, isSuperAdmin } = useOrganization();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  if (selectedOrgId === PLANIPRET_ORG_ID) return <>{children}</>;
  const isMember = organizations.some((o: any) => (o.id || o.organization?.id) === PLANIPRET_ORG_ID);
  // Super admins always force-load the Planipret context, even if they are
  // not an explicit member of the organization. This guarantees that
  // /planipret/admin/* never inherits a stale "default" org from localStorage.
  if (isMember || isSuperAdmin) {
    setSelectedOrgId(PLANIPRET_ORG_ID);
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Switching to Planipret…</div>;
  }
  return <Navigate to="/dashboard" replace />;
};


const LemtelAdminPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><AppSeparationGuard app="lemtel"><LemtelGuard><ImpersonationProvider><AdminPortalLayout>{children}</AdminPortalLayout></ImpersonationProvider></LemtelGuard></AppSeparationGuard></ProtectedRoute>
);

const LemtelUserPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><AppSeparationGuard app="lemtel"><LemtelGuard><UserPortalLayout>{children}</UserPortalLayout></LemtelGuard></AppSeparationGuard></ProtectedRoute>
);

const LemtelTelephonyPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute><AppSeparationGuard app="lemtel"><LemtelGuard><TelephonyLayout>{children}</TelephonyLayout></LemtelGuard></AppSeparationGuard></ProtectedRoute>
);

function NativeDeepLinkBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const routeFromUrl = (rawUrl?: string | null) => {
      if (!rawUrl) return;
      try {
        const url = new URL(rawUrl);
        const pathWithHost = `/${[url.hostname, url.pathname].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
        const isMs365Callback =
          url.pathname === '/auth/microsoft/callback' ||
          url.pathname === '/auth/ms365/callback' ||
          pathWithHost === '/auth/microsoft/callback' ||
          pathWithHost === '/auth/ms365/callback';

        if (isMs365Callback) {
          localStorage.setItem('pp_ms365_callback_url', rawUrl);
          navigate(`/auth/microsoft/callback${url.search}`, { replace: true });
        }
      } catch {
        // Ignore non-URL events.
      }
    };

    let unsubscribe: null | (() => void) = null;
    (async () => {
      try {
        const { App: CapacitorApp } = await import('@capacitor/app');
        const launch = await CapacitorApp.getLaunchUrl();
        routeFromUrl(launch?.url);
        const listener = await CapacitorApp.addListener('appUrlOpen', (event: { url: string }) => routeFromUrl(event.url));
        unsubscribe = () => { try { listener.remove(); } catch {} };
      } catch {
        // Web preview: no native deep links.
      }
    })();

    return () => unsubscribe?.();
  }, [navigate]);

  return null;
}

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
          <Sonner />
          <BrowserRouter>
            <NativeDeepLinkBridge />

            <OrganizationProvider>
              <RouteDebugOverlay />
              <Suspense fallback={<AdminPageSkeleton />}>
              <Routes>
                {/* Landing page on root */}
                <Route path="/" element={<Landing />} />

                {/* Public full feature list */}
                <Route path="/features" element={<FeaturesPage />} />

                {/* Public demo request */}
                <Route path="/demo-request" element={<DemoRequestPage />} />
                
                {/* Contact Us */}
                <Route path="/contact" element={<ContactUs />} />

                {/* Public download page */}
                <Route path="/download" element={<Download />} />
                <Route path="/mobile-preview" element={<MobilePreview />} />
                <Route path="/m" element={<MobileEmbed />} />
                
                {/* Universal login - redirects based on user type */}
                <Route path="/login" element={<UniversalLogin />} />
                <Route path="/portal" element={<Navigate to="/login" replace />} />
                <Route path="/reset-password" element={<ResetPassword />} />

                <Route path="/portals" element={<PortalChooser />} />
                <Route path="/c/:domain" element={<CustomerPortalGate />} />
                <Route path="/end-user/login" element={<EndUserLogin />} />
                <Route path="/extension/login" element={<Navigate to="/end-user/login" replace />} />
                
                {/* Admin auth (legacy, redirects to /login) */}
                <Route path="/auth" element={<Navigate to="/login" replace />} />

                {/* Planiprêt — auth via avastatistic.ca SSO */}
                <Route path="/planipret" element={<Navigate to="/planipret/admin/overview" replace />} />
                <Route path="/planipret/login" element={<Navigate to={loginWithRedirect(ROUTES.MPLANIPRET)} replace />} />
                {/* Legacy alias — old links/bookmarks land here, forward to the canonical mobile app */}
                <Route path="/planipret/mobile" element={<Navigate to={ROUTES.MPLANIPRET} replace />} />
                <Route path="/planipret/mobile/*" element={<Navigate to={ROUTES.MPLANIPRET} replace />} />
                <Route path="/lemtel/setup/:token" element={<SoftphoneSetup />} />
                <Route path="/lemtel/redeem/:token" element={<SoftphoneSetup />} />
                <Route path={ROUTES.MPLANIPRET} element={<MplanipretGuard><PlanipretMobile /></MplanipretGuard>}>
                  <Route index element={<Suspense fallback={<MobilePageSkeleton />}><MHome /></Suspense>} />
                  <Route path="home" element={<Suspense fallback={<MobilePageSkeleton />}><MHome /></Suspense>} />
                  <Route path="calls" element={<Suspense fallback={<MobilePageSkeleton />}><MCalls /></Suspense>} />
                  <Route path="messages" element={<Suspense fallback={<MobilePageSkeleton />}><MMessages /></Suspense>} />
                  <Route path="voicemail" element={<Suspense fallback={<MobilePageSkeleton />}><MVoicemail /></Suspense>} />
                  <Route path="contacts" element={<Suspense fallback={<MobilePageSkeleton />}><MContacts /></Suspense>} />
                  <Route path="more" element={<Suspense fallback={<MobilePageSkeleton />}><MMore /></Suspense>} />
                  <Route path="pipeline" element={<Suspense fallback={<MobilePageSkeleton />}><MPipeline /></Suspense>} />
                  <Route path="search" element={<Suspense fallback={<MobilePageSkeleton />}><MSearch /></Suspense>} />
                  <Route path="stats" element={<Suspense fallback={<MobilePageSkeleton />}><MStats /></Suspense>} />
                  <Route path="ava" element={<Suspense fallback={<MobilePageSkeleton />}><MAvaChat /></Suspense>} />
                  <Route path="notifications" element={<Suspense fallback={<MobilePageSkeleton />}><MAvaNotifications /></Suspense>} />
                  <Route path="extension-sync" element={<Suspense fallback={<MobilePageSkeleton />}><MExtensionSync /></Suspense>} />
                </Route>
                <Route path="/planipret/dashboard" element={<Navigate to="/planipret/admin/overview" replace />} />
                <Route path="/planipret/integrations" element={<Navigate to="/planipret/admin/integrations" replace />} />
                <Route path="/auth/ms365/callback" element={<Ms365Callback />} />
                <Route path="/auth/microsoft/callback" element={<Ms365Callback />} />
                <Route path="/auth/callback" element={<Ms365Callback />} />
                <Route path="/mplanipret/ms365-diagnostics" element={<Ms365Diagnostics />} />
                <Route path="/planipret/ms365-diagnostics" element={<Ms365Diagnostics />} />
                <Route path="/mplanipret/style-diagnostics" element={<MStyleDiagnosticsWeb />} />
                <Route path="/planipret/style-diagnostics" element={<MStyleDiagnosticsWeb />} />

                <Route path="/planipret/audit" element={<AppSeparationGuard app="planipret"><PlanipretAudit /></AppSeparationGuard>} />
                <Route path="/planipret/store-preflight" element={<AppSeparationGuard app="planipret"><StorePreflightPreview /></AppSeparationGuard>} />


                {/* Planipret Admin sub-routes (layout with sidebar) — lazy-loaded */}
                <Route
                  path="/planipret/admin"
                  element={
                    <AppSeparationGuard app="planipret">
                      <PlanipretOrgOnly>
                        <Suspense fallback={<AdminPageSkeleton />}>
                          <PlanipretAdminLayout />
                        </Suspense>
                      </PlanipretOrgOnly>
                    </AppSeparationGuard>
                  }
                >
                  <Route index element={<Suspense fallback={<AdminPageSkeleton />}><PAOverview /></Suspense>} />
                  <Route path="overview" element={<Suspense fallback={<AdminPageSkeleton />}><PAOverview /></Suspense>} />
                  <Route path="users" element={<Suspense fallback={<AdminPageSkeleton />}><PAUsers /></Suspense>} />
                  <Route path="calls" element={<Suspense fallback={<AdminPageSkeleton />}><PACalls /></Suspense>} />
                  <Route path="messages" element={<Suspense fallback={<AdminPageSkeleton />}><PAMessages /></Suspense>} />
                  <Route path="voicemails" element={<Navigate to="/planipret/admin/recordings" replace />} />
                  <Route path="recordings" element={<Suspense fallback={<AdminPageSkeleton />}><PARecordings /></Suspense>} />
                  <Route path="reports" element={<Suspense fallback={<AdminPageSkeleton />}><PAReports /></Suspense>} />
                  <Route path="audit" element={<Suspense fallback={<AdminPageSkeleton />}><PAAuditLog /></Suspense>} />
                  <Route path="audit-checklist" element={<Suspense fallback={<AdminPageSkeleton />}><PAAuditChecklist /></Suspense>} />
                  <Route path="compliance" element={<Suspense fallback={<AdminPageSkeleton />}><PACompliance /></Suspense>} />
                  <Route path="leads" element={<Suspense fallback={<AdminPageSkeleton />}><PALeads /></Suspense>} />
                  <Route path="templates" element={<Suspense fallback={<AdminPageSkeleton />}><PATemplates /></Suspense>} />
                  <Route path="integrations" element={<Suspense fallback={<AdminPageSkeleton />}><PlanipretIntegrationsLazy /></Suspense>} />
                  <Route path="debug" element={<Suspense fallback={<AdminPageSkeleton />}><PADebug /></Suspense>} />
                  <Route path="ava" element={<Suspense fallback={<AdminPageSkeleton />}><PAAva /></Suspense>} />
                  <Route path="ava-agent" element={<Suspense fallback={<AdminPageSkeleton />}><PAAvaAgent /></Suspense>} />
                  <Route path="ava-logs" element={<Suspense fallback={<AdminPageSkeleton />}><PAAvaLogs /></Suspense>} />
                  <Route path="mobile-devices" element={<Suspense fallback={<AdminPageSkeleton />}><PAMobileDevices /></Suspense>} />
                  <Route path="sip-diagnostic" element={<Suspense fallback={<AdminPageSkeleton />}><PASipDiagnostic /></Suspense>} />
                  <Route path="diagnostics" element={<Suspense fallback={<AdminPageSkeleton />}><PADiagnostics /></Suspense>} />
                  <Route path="maestro-sync" element={<Suspense fallback={<AdminPageSkeleton />}><PAMaestroSync /></Suspense>} />
                </Route>
                <Route path="/planipret/privacy" element={<Suspense fallback={<AdminPageSkeleton />}><PlanipretPrivacy /></Suspense>} />

                {/* Protected routes */}
                <Route
                  path="/home"
                  element={
                    <ProtectedRoute>
                      <AgencyHome />
                    </ProtectedRoute>
                  }
                />

                {/* Main multi-org dashboard (org switcher with Planipret / Lemtel / AVA) */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Dashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Legacy AVA admin portal is now strictly hosted inside the Planipret organization. */}
                <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>


                <Route
                  path="/analytics"
                  element={
                    <ProtectedRoute>
                      <VoiceAnalytics />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/conversations"
                  element={
                    <ProtectedRoute>
                      <Conversations />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/conversations/:id"
                  element={
                    <ProtectedRoute>
                      <ConversationDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/knowledge-base"
                  element={
                    <ProtectedRoute>
                      <KnowledgeBase />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/profile"
                  element={
                    <ProtectedRoute>
                      <Profile />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/clients"
                  element={
                    <ProtectedRoute>
                      <Clients />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/clients/new"
                  element={
                    <ProtectedRoute>
                      <ClientCreateWizard />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/clients/:clientId"
                  element={
                    <ProtectedRoute>
                      <ClientDetail />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/integrations"
                  element={
                    <ProtectedRoute>
                      <Integrations />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/twilio-management"
                  element={
                    <ProtectedRoute>
                      <TwilioManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/webhook-logs"
                  element={
                    <ProtectedRoute>
                      <WebhookLogs />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/stripe-billing"
                  element={
                    <ProtectedRoute>
                      <StripeBilling />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/saas-config"
                  element={
                    <ProtectedRoute>
                      <SaaSConfigurator />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/email-templates"
                  element={
                    <ProtectedRoute>
                      <EmailTemplates />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agents"
                  element={
                    <ProtectedRoute>
                      <Agents />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agent-settings/:agentId"
                  element={
                    <ProtectedRoute>
                      <AgentSettings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/team"
                  element={
                    <ProtectedRoute>
                      <Team />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/api-keys"
                  element={
                    <ProtectedRoute>
                      <ApiKeys />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/workflows"
                  element={
                    <ProtectedRoute>
                      <Workflows />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/workflow-builder/:workflowId"
                  element={
                    <ProtectedRoute>
                      <WorkflowBuilder />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/topics"
                  element={
                    <ProtectedRoute>
                      <Topics />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/campaigns"
                  element={
                    <ProtectedRoute>
                      <Campaigns />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/appointments"
                  element={
                    <ProtectedRoute>
                      <Appointments />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agent-reports"
                  element={
                    <ProtectedRoute>
                      <AgentReports />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agent-builder"
                  element={
                    <ProtectedRoute>
                      <AgentBuilder />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agent-builder/:agentId"
                  element={
                    <ProtectedRoute>
                      <AgentBuilder />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/agent-comparison"
                  element={
                    <ProtectedRoute>
                      <AgentComparison />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/leads"
                  element={
                    <ProtectedRoute>
                      <Leads />
                    </ProtectedRoute>
                  }
                />
                {/* /phone-numbers removed — use Domain → Destinations */}
                <Route path="/phone-numbers" element={<Navigate to="/lemtel/dids" replace />} />
                <Route
                  path="/handoffs"
                  element={
                    <ProtectedRoute>
                      <Handoffs />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/sms-templates"
                  element={
                    <ProtectedRoute>
                      <SmsTemplates />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings/baa"
                  element={
                    <ProtectedRoute>
                      <BAAgreement />
                    </ProtectedRoute>
                  }
                />
                </Route>
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/support" element={<Support />} />
                <Route path="/legal" element={<Legal />} />
                <Route path="/docs" element={<Docs />} />
                <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
                <Route
                  path="/demo"
                  element={
                    <ProtectedRoute>
                      <DemoCenter />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/realtime"
                  element={<RealtimeMonitor />}
                />
                <Route
                  path="/api-explorer"
                  element={<ApiExplorer />}
                />
                <Route
                  path="/super-admin"
                  element={<SuperAdminDashboard />}
                />
                <Route
                  path="/audit-logs"
                  element={<AuditLogs />}
                />
                </Route>
                
                {/* Lemtel Telecom Module — gated to Lemtel org members */}
                <Route path="/lemtel/dashboard" element={<ProtectedRoute><LemtelGuard><LemtelDashboard /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/settings" element={<ProtectedRoute><LemtelGuard><LemtelSettings /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/integrations/providers" element={<ProtectedRoute><LemtelGuard><ProviderCredentials /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/messages" element={<ProtectedRoute><LemtelGuard><LemtelMessages /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/customers" element={<ProtectedRoute><LemtelGuard><LemtelCustomers /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/dids" element={<ProtectedRoute><LemtelGuard><LemtelDIDs /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/extensions" element={<ProtectedRoute><LemtelGuard><LemtelExtensions /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/devices" element={<ProtectedRoute><LemtelGuard><LemtelDevices /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/queues" element={<ProtectedRoute><LemtelGuard><LemtelQueues /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/ivr" element={<ProtectedRoute><LemtelGuard><LemtelIVR /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/voice-agents" element={<ProtectedRoute><LemtelGuard><LemtelVoiceAgents /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/softphone-users" element={<ProtectedRoute><LemtelGuard><LemtelSoftphoneUsers /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/analytics" element={<ProtectedRoute><LemtelGuard><LemtelAnalytics /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/calls" element={<ProtectedRoute><LemtelGuard><LemtelPortalCalls /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/dashboard" element={<ProtectedRoute><LemtelGuard><LemtelDashboard /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/extensions" element={<ProtectedRoute><LemtelGuard><LemtelExtensions /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/recordings" element={<ProtectedRoute><LemtelGuard><LemtelStub title="Recordings" description="Call recordings will appear here once FusionPBX is connected." /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/queues" element={<ProtectedRoute><LemtelGuard><LemtelQueues /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/ivr" element={<ProtectedRoute><LemtelGuard><LemtelIVR /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/messages" element={<ProtectedRoute><LemtelGuard><LemtelMessages /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/agents" element={<ProtectedRoute><LemtelGuard><LemtelVoiceAgents /></LemtelGuard></ProtectedRoute>} />
                <Route path="/lemtel/portal/softphone" element={<ProtectedRoute><LemtelGuard><LemtelStub title="Softphone" description="Use the floating softphone widget at the bottom-right." /></LemtelGuard></ProtectedRoute>} />

                {/* New /org/lemtel/telephony/* admin routes */}
                <Route path="/org/lemtel/telephony/dashboard" element={<LemtelTelephonyPage><TelephonyDashboard /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/numbers" element={<LemtelTelephonyPage><LemtelDIDs /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/extensions" element={<LemtelTelephonyPage><LemtelExtensions /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/users" element={<LemtelTelephonyPage><TelephonyUsers /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/devices" element={<LemtelTelephonyPage><LemtelDevices /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/calls" element={<LemtelTelephonyPage><LemtelPortalCalls /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/recordings" element={<LemtelTelephonyPage><TelephonyRecordings /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/ai-pipeline" element={<LemtelTelephonyPage><CallIntelligenceDashboard /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/media" element={<LemtelTelephonyPage><TelephonyMediaCenter scope="org" /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/ivr" element={<LemtelTelephonyPage><LemtelIVR /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/queues" element={<LemtelTelephonyPage><LemtelQueues /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/ring-groups" element={<LemtelTelephonyPage><TelephonyRingGroups /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/messages" element={<LemtelTelephonyPage><LemtelMessages /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/agents" element={<LemtelTelephonyPage><LemtelVoiceAgents /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/ai" element={<LemtelTelephonyPage><TelephonyAI /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/webphone" element={<LemtelTelephonyPage><TelephonyWebphone /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/settings" element={<LemtelTelephonyPage><TelephonySettings /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/voicemail" element={<LemtelTelephonyPage><TelephonyVoicemail /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/team" element={<LemtelTelephonyPage><TelephonyTeam /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/preferences" element={<LemtelTelephonyPage><TelephonyUserPreferences /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/advanced" element={<LemtelTelephonyPage><TelephonyAdvanced /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/sync-health" element={<LemtelTelephonyPage><TelephonySyncHealth /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/callcenter/agent" element={<LemtelTelephonyPage><CallCenterAgent /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/callcenter/wallboard" element={<LemtelTelephonyPage><CallCenterWallboard /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/callcenter/admin" element={<LemtelTelephonyPage><CallCenterAdmin /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/diagnostics" element={<LemtelTelephonyPage><TelephonyDiagnostics /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/qa" element={<LemtelTelephonyPage><TelephonyDiagnostics /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/source-audit" element={<LemtelTelephonyPage><TelephonySourceAudit /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/_diagnostics" element={<LemtelTelephonyPage><TelephonySourceAudit /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/phone-numbers-unified" element={<LemtelTelephonyPage><PhoneNumbersUnified /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/admin-users" element={<LemtelTelephonyPage><PbxAdminUsers /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/registrations-live" element={<LemtelTelephonyPage><LiveRegistrations /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/voice-agents-live" element={<LemtelTelephonyPage><VoiceAgentsLive /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/checklist" element={<LemtelTelephonyPage><TelephonyChecklist /></LemtelTelephonyPage>} />
                <Route path="/org/lemtel/telephony/portal-mappings" element={<LemtelTelephonyPage><TelephonyPortalMappings /></LemtelTelephonyPage>} />

                {/* v3.0 Admin Portal (/org/lemtel/admin/*) */}
                <Route path="/org/lemtel/admin" element={<Navigate to="/org/lemtel/admin/dashboard" replace />} />
                <Route path="/org/lemtel/admin/dashboard" element={<LemtelAdminPage><AdminDashboard /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/extensions" element={<LemtelAdminPage><LemtelExtensions /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/pbx-users" element={<LemtelAdminPage><LemtelPbxUsers /></LemtelAdminPage>} />
                {/* Phone Numbers page removed — duplicate of Inbound Routes/Destinations */}
                <Route path="/org/lemtel/admin/dids" element={<Navigate to="/org/lemtel/admin/destinations" replace />} />
                <Route path="/org/lemtel/admin/devices" element={<LemtelAdminPage><LemtelDevices /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/ivr" element={<LemtelAdminPage><LemtelIVR /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/queues" element={<LemtelAdminPage><LemtelQueues /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/ring-groups" element={<LemtelAdminPage><TelephonyRingGroups /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/agents" element={<LemtelAdminPage><LemtelVoiceAgents /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/conversations" element={<LemtelAdminPage><Conversations /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/customers" element={<LemtelAdminPage><LemtelCustomers /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/customers/:domainUuid" element={<LemtelAdminPage><CustomerDetail /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/porting" element={<LemtelAdminPage><PortingQueue /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/gateways" element={<LemtelAdminPage><LemtelGateways /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/voice-gateways" element={<LemtelAdminPage><LemtelVoiceGateways /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/calls" element={<LemtelAdminPage><TelephonyMediaCenter scope="org" /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/cdrs" element={<Navigate to="/org/lemtel/admin/calls" replace />} />
                <Route path="/org/lemtel/admin/recordings" element={<LemtelAdminPage><AdminRecordings /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/voicemail" element={<LemtelAdminPage><AdminVoicemail /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/reports" element={<LemtelAdminPage><AdminReports /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/destinations" element={<LemtelAdminPage><AdminDestinations /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/time-conditions" element={<LemtelAdminPage><AdminTimeConditions /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/settings" element={<LemtelAdminPage><TelephonySettings /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/hours" element={<LemtelAdminPage><BusinessHours /></LemtelAdminPage>} />
                <Route path="/org/:slug/admin" element={<Navigate to="dashboard" replace />} />
                <Route path="/org/:slug/admin/dashboard" element={<ProtectedRoute><AdminPortalLayout><CustomerDashboard /></AdminPortalLayout></ProtectedRoute>} />
                <Route path="/org/:slug/admin/hours" element={<ProtectedRoute><AdminPortalLayout><BusinessHours /></AdminPortalLayout></ProtectedRoute>} />
                <Route path="/org/:slug/admin/settings" element={<ProtectedRoute><AdminPortalLayout><CustomerSettings /></AdminPortalLayout></ProtectedRoute>} />
                <Route path="/org/lemtel/admin/downloads" element={<LemtelAdminPage><DownloadCenter /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/fax" element={<LemtelAdminPage><LemtelStub title="Fax Server" description="Configure inbound/outbound fax routing." /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/conferences" element={<LemtelAdminPage><AdminConferences /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/hold-music" element={<LemtelAdminPage><AdminHoldMusic /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/sync-health" element={<LemtelAdminPage><AdminSyncHealth /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/active-calls" element={<LemtelAdminPage><AdminActiveCalls /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/registrations" element={<LemtelAdminPage><AdminRegistrations /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/system-status" element={<LemtelAdminPage><AdminSystemStatus /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/ai-actions" element={<LemtelAdminPage><AdminAIActions /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/sip-profiles" element={<LemtelAdminPage><AdminSipProfiles /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/dialplans" element={<LemtelAdminPage><AdminDialplans /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/feature-codes" element={<LemtelAdminPage><AdminFeatureCodes /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/call-forwarding" element={<LemtelAdminPage><AdminCallForwarding /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/recording-rules" element={<LemtelAdminPage><AdminRecordingRules /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/voicemail-settings" element={<LemtelAdminPage><AdminVoicemailSettings /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/conference-centers" element={<LemtelAdminPage><LemtelStub title="Conference Centers" description="Multi-tenant conference bridges." /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/email-queue" element={<LemtelAdminPage><LemtelStub title="Email Queue" description="Outbound notification email queue." /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/call-block" element={<LemtelAdminPage><LemtelStub title="Call Block" description="Block inbound caller IDs and patterns." /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/contacts" element={<LemtelAdminPage><LemtelStub title="Contacts" description="Shared contact directory." /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/fax-queue" element={<LemtelAdminPage><LemtelStub title="Fax Queue" description="Pending and recent fax transmissions." /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/event-guard" element={<LemtelAdminPage><LemtelStub title="Event Guard" description="Fraud detection and abuse alerts." /></LemtelAdminPage>} />
                <Route path="/org/lemtel/admin/business-hours" element={<Navigate to="/org/lemtel/admin/hours" replace />} />
                <Route path="/org/lemtel/analytics/cdrs" element={<Navigate to="/org/lemtel/telephony/calls" replace />} />
                <Route path="/org/lemtel/analytics/calls" element={<Navigate to="/org/lemtel/telephony/calls" replace />} />
                <Route path="/org/lemtel/analytics" element={<Navigate to="/org/lemtel/telephony/calls" replace />} />

                {/* Per-customer-domain phone-system cockpit (/domain/:slug/admin/*).
                    Mirrors the Lemtel admin portal but scoped to the customer's org. */}
                <Route path="/domain/:slug/admin" element={<Navigate to="dashboard" replace />} />
                <Route path="/domain/:slug/admin/dashboard" element={<ProtectedRoute><CustomerDomainGate><DomainDashboard /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/extensions" element={<ProtectedRoute><CustomerDomainGate><LemtelExtensions /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/pbx-users" element={<ProtectedRoute><CustomerDomainGate><LemtelPbxUsers /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/devices" element={<ProtectedRoute><CustomerDomainGate><LemtelDevices /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/dids" element={<ProtectedRoute><CustomerDomainGate><LemtelDIDs /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/numbers" element={<Navigate to="../dids" replace />} />
                <Route path="/domain/:slug/admin/ivr" element={<ProtectedRoute><CustomerDomainGate><LemtelIVR /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/queues" element={<ProtectedRoute><CustomerDomainGate><LemtelQueues /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/ring-groups" element={<ProtectedRoute><CustomerDomainGate><TelephonyRingGroups /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/hold-music" element={<ProtectedRoute><CustomerDomainGate><AdminHoldMusic /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/recordings" element={<ProtectedRoute><CustomerDomainGate><AdminRecordings /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/calls" element={<ProtectedRoute><CustomerDomainGate><TelephonyMediaCenter scope="org" /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/voicemail" element={<ProtectedRoute><CustomerDomainGate><AdminVoicemail /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/hours" element={<ProtectedRoute><CustomerDomainGate><BusinessHours /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/time-conditions" element={<ProtectedRoute><CustomerDomainGate><AdminTimeConditions /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/conferences" element={<ProtectedRoute><CustomerDomainGate><AdminConferences /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/destinations" element={<ProtectedRoute><CustomerDomainGate><AdminDestinations /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/call-forwarding" element={<ProtectedRoute><CustomerDomainGate><AdminCallForwarding /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/recording-rules" element={<ProtectedRoute><CustomerDomainGate><AdminRecordingRules /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/voicemail-settings" element={<ProtectedRoute><CustomerDomainGate><AdminVoicemailSettings /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/active-calls" element={<ProtectedRoute><CustomerDomainGate><AdminActiveCalls /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/registrations" element={<ProtectedRoute><CustomerDomainGate><AdminRegistrations /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/reports" element={<ProtectedRoute><CustomerDomainGate><AdminReports /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/sync-health" element={<ProtectedRoute><CustomerDomainGate><AdminSyncHealth /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/agents" element={<ProtectedRoute><CustomerDomainGate><LemtelVoiceAgents /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/settings" element={<ProtectedRoute><CustomerDomainGate><CustomerSettings /></CustomerDomainGate></ProtectedRoute>} />
                <Route path="/domain/:slug/admin/downloads" element={<ProtectedRoute><CustomerDomainGate><DownloadCenter /></CustomerDomainGate></ProtectedRoute>} />




                {/* v3.0 User Portal (/org/lemtel/my/*) */}
                <Route path="/org/lemtel/my" element={<Navigate to="/my" replace />} />
                <Route path="/org/lemtel/my/dashboard" element={<Navigate to="/my" replace />} />
                <Route path="/org/lemtel/my/calls" element={<Navigate to="/my/calls" replace />} />
                <Route path="/org/lemtel/my/recordings" element={<Navigate to="/my/recordings" replace />} />
                <Route path="/org/lemtel/my/voicemail" element={<Navigate to="/my/voicemail" replace />} />
                <Route path="/org/lemtel/my/sms" element={<Navigate to="/my/messages" replace />} />
                <Route path="/org/lemtel/my/settings" element={<Navigate to="/my/settings" replace />} />
                <Route path="/org/lemtel/my/downloads" element={<Navigate to="/my/downloads" replace />} />
                <Route path="/org/lemtel/my/forwarding" element={<Navigate to="/my/telecom" replace />} />
                <Route path="/org/lemtel/my/devices" element={<Navigate to="/my/telecom" replace />} />
                <Route path="/org/lemtel/my/greetings" element={<Navigate to="/my/greetings" replace />} />

                {/* /org/lemtel/portal/* customer routes (PortalGuard enforces customer scope) */}
                <Route path="/org/lemtel/portal" element={<Navigate to="/org/lemtel/portal/dashboard" replace />} />
                <Route path="/org/lemtel/portal/diagnostic" element={<ProtectedRoute><PortalDiagnostic /></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/dashboard" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><LemtelPortalDashboard /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/extensions" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><LemtelExtensions /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/calls" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><LemtelPortalCalls scope="mine" /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/recordings" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><TelephonyRecordings scope="mine" /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/media" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><TelephonyMediaCenter scope="mine" /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/ivr" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><LemtelIVR /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/queues" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><LemtelQueues /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/messages" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><LemtelMessages /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/agents" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><LemtelVoiceAgents /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />
                <Route path="/org/lemtel/portal/softphone" element={<ProtectedRoute><LemtelGuard><PortalGuard><TelephonyLayout portal><TelephonyWebphone /></TelephonyLayout></PortalGuard></LemtelGuard></ProtectedRoute>} />

                
                <Route
                  path="/client/login"
                  element={
                    <ClientProvider>
                      <ClientLogin />
                    </ClientProvider>
                  }
                />
                <Route
                  path="/client/forgot-password"
                  element={
                    <ClientProvider>
                      <ClientForgotPassword />
                    </ClientProvider>
                  }
                />
                <Route
                  path="/client/reset-password/:token"
                  element={
                    <ClientProvider>
                      <ClientResetPassword />
                    </ClientProvider>
                  }
                />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/client/:clientId" element={<ClientPortal />}>

                  <Route path="conversations" element={<ClientConversations />} />
                  <Route path="analytics" element={<ClientAnalytics />} />
                </Route>

                {/* Client Agent Portal Routes - Per agent access */}
                <Route path="/client/:clientId/agent/:agentId" element={<ClientAgentPortal />}>
                  <Route path="dashboard" element={<ClientAgentDashboard />} />
                  <Route path="conversations" element={<ClientAgentConversations />} />
                  <Route path="analytics" element={<ClientAgentAnalytics />} />
                  <Route path="knowledge" element={<ClientAgentKnowledge />} />
                  <Route path="settings" element={<ClientAgentSettings />} />
                  <Route path="endpoints" element={<ClientAgentEndpoints />} />
                  <Route path="mcp" element={<ClientAgentMCP />} />
                  <Route path="webhooks" element={<ClientAgentWebhooks />} />
                  <Route path="widget" element={<ClientAgentWidget />} />
                </Route>

                {/* New Portal Routes - Agent slug based directly at root */}
                <Route path="/:agentSlug">
                  <Route index element={<PortalLogin />} />
                  <Route element={<PortalLayout />}>
                    <Route path="dashboard" element={<PortalDashboard />} />
                    <Route path="conversations" element={<PortalConversations />} />
                    <Route path="analytics" element={<PortalAnalytics />} />
                    <Route path="knowledge" element={<PortalKnowledge />} />
                    <Route path="prompt" element={<PortalPrompt />} />
                    <Route path="settings" element={<PortalSettings />} />
                    <Route path="profile" element={<PortalProfile />} />
                  </Route>
                </Route>

                {/* Keep legacy portal routes for backward compatibility */}
                <Route path="/portal/:agentSlug">
                  <Route index element={<PortalLogin />} />
                  <Route element={<PortalLayout />}>
                    <Route path="dashboard" element={<PortalDashboard />} />
                    <Route path="conversations" element={<PortalConversations />} />
                    <Route path="analytics" element={<PortalAnalytics />} />
                    <Route path="knowledge" element={<PortalKnowledge />} />
                    <Route path="prompt" element={<PortalPrompt />} />
                    <Route path="settings" element={<PortalSettings />} />
                    <Route path="profile" element={<PortalProfile />} />
                  </Route>
                </Route>

                {/* Public Widget Routes - No authentication */}
                <Route path="/prototype/:agentId" element={<WidgetPrototype />} />
                <Route path="/iframe/:agentId" element={<WidgetIframe />} />

                {/* v4.0.0 — Multi-tenant routes (white-labelled per :slug) */}
                <Route
                  path="/org/:slug/master"
                  element={
                    <ProtectedRoute>
                      <WhitelabelProvider>
                        <ImpersonationProvider>
                          <LemtelGuard>
                            <MasterShell />
                          </LemtelGuard>
                        </ImpersonationProvider>
                      </WhitelabelProvider>
                    </ProtectedRoute>
                  }
                >
                  <Route path="dashboard" element={<MasterDashboard />} />
                  <Route path="organizations" element={<MasterOrganizations />} />
                  <Route path="users" element={<MasterAllUsers />} />
                  <Route path="calls" element={<MasterAllCalls />} />
                  <Route path="billing" element={<MasterBilling />} />
                  <Route path="system" element={<MasterSystem />} />
                  <Route path="audit" element={<MasterAuditLogs />} />
                </Route>

                <Route
                  path="/org/:slug/reseller"
                  element={
                    <ProtectedRoute>
                      <WhitelabelProvider>
                        <ImpersonationProvider>
                          <ResellerShell />
                        </ImpersonationProvider>
                      </WhitelabelProvider>
                    </ProtectedRoute>
                  }
                >
                  <Route path="dashboard" element={<ResellerDashboard />} />
                  <Route path="customers" element={<ResellerDashboard />} />
                  <Route path="users" element={<ResellerDashboard />} />
                  <Route path="settings" element={<ResellerSettings />} />
                  <Route path="billing" element={<ResellerDashboard />} />
                </Route>

                <Route path="/post-login" element={<ProtectedRoute><PostLoginRedirect /></ProtectedRoute>} />

                {/* === Three-portal architecture === */}
                {/* Platform Admin — AVA super-admin org only */}
                <Route path="/platform" element={<ProtectedRoute><AvaPlatformOrgOnly><RolePortalGuard portal="platform"><PlatformAdminShell /></RolePortalGuard></AvaPlatformOrgOnly></ProtectedRoute>}>
                  <Route index element={<PlatformDashboard />} />
                  <Route path="organizations" element={<MasterOrganizations />} />
                  <Route path="users" element={<MasterAllUsers />} />
                  <Route path="calls" element={<LemtelOrgOnly fallback="/platform"><MasterAllCalls /></LemtelOrgOnly>} />
                  <Route path="telephony" element={<LemtelOrgOnly fallback="/platform"><TelephonyDashboard /></LemtelOrgOnly>} />
                  <Route path="billing" element={<MasterBilling />} />
                  <Route path="system" element={<MasterSystem />} />
                  <Route path="health" element={<PlatformSystemHealth />} />
                  <Route path="qa" element={<LemtelOrgOnly fallback="/platform"><PlatformTelephonyQA /></LemtelOrgOnly>} />
                  <Route path="audit" element={<MasterAuditLogs />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="ai-usage" element={<PlatformAIUsage />} />
                </Route>

                {/* Customer Admin — workspace owners / resellers */}
                <Route path="/customer" element={<ProtectedRoute><RolePortalGuard portal="customer"><CustomerAdminShell /></RolePortalGuard></ProtectedRoute>}>
                  <Route index element={<CustomerDashboard />} />
                  <Route path="team" element={<Team />} />
                  <Route path="extensions" element={<LemtelOrgOnly fallback="/customer"><LemtelExtensions /></LemtelOrgOnly>} />
                  <Route path="queues" element={<LemtelOrgOnly fallback="/customer"><LemtelQueues /></LemtelOrgOnly>} />
                  <Route path="ivr" element={<LemtelOrgOnly fallback="/customer"><LemtelIVR /></LemtelOrgOnly>} />
                  <Route path="numbers" element={<Navigate to="/lemtel/dids" replace />} />
                  <Route path="calls" element={<LemtelOrgOnly fallback="/customer"><TelephonyMediaCenter scope="org" /></LemtelOrgOnly>} />
                  <Route path="cdrs" element={<LemtelOrgOnly fallback="/customer"><LemtelPortalCalls /></LemtelOrgOnly>} />
                  <Route path="recordings" element={<LemtelOrgOnly fallback="/customer"><AdminRecordings /></LemtelOrgOnly>} />
                  <Route path="analytics" element={<LemtelOrgOnly fallback="/customer"><LemtelAnalytics /></LemtelOrgOnly>} />
                  <Route path="knowledge" element={<KnowledgeBase />} />
                  <Route path="billing" element={<StripeBilling />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="chat" element={<MyOrgChat />} />
                  <Route path="ai-admin" element={<CustomerAdminAIChat />} />
                  <Route path="sync-health" element={<LemtelOrgOnly fallback="/customer"><CustomerSyncHealth /></LemtelOrgOnly>} />
                  <Route path="reports" element={<LemtelOrgOnly fallback="/customer"><LemtelAnalytics /></LemtelOrgOnly>} />
                </Route>

                {/* My Workspace — end users */}
                <Route path="/my" element={<ProtectedRoute><RolePortalGuard portal="my"><MyWorkspaceShellSidebar /></RolePortalGuard></ProtectedRoute>}>
                  <Route index element={<MyDashboardLanding />} />
                  <Route path="dashboard" element={<MyDashboardLanding />} />
                  <Route path="softphone" element={<LemtelOrgOnly fallback="/my"><TelephonyWebphone /></LemtelOrgOnly>} />
                  <Route path="calls" element={<LemtelOrgOnly fallback="/my"><TelephonyMediaCenter scope="mine" /></LemtelOrgOnly>} />
                  <Route path="voicemail" element={<LemtelOrgOnly fallback="/my"><MyVoicemail /></LemtelOrgOnly>} />
                  <Route path="greetings" element={<LemtelOrgOnly fallback="/my"><MyGreetingsLibrary /></LemtelOrgOnly>} />
                  <Route path="messages" element={<LemtelOrgOnly fallback="/my"><LemtelMessages /></LemtelOrgOnly>} />
                  <Route path="recordings" element={<LemtelOrgOnly fallback="/my"><MyRecordings /></LemtelOrgOnly>} />
                  <Route path="chat" element={<MyOrgChat />} />
                  <Route path="telecom" element={<LemtelOrgOnly fallback="/my"><MyTelecomSettings /></LemtelOrgOnly>} />
                  <Route path="ai" element={<MyAIAssistant />} />
                  <Route path="downloads" element={<DownloadCenter personalize />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="settings" element={<MySettings />} />
                </Route>

                {/* PBX Command Center (desktop admin shell) */}
                <Route path="/console" element={<ProtectedRoute><LemtelOrgOnly><ConsoleShell /></LemtelOrgOnly></ProtectedRoute>}>
                  <Route index element={<ConsoleDashboard />} />
                  <Route path="extensions" element={<ConsoleExtensions />} />
                  <Route path="devices" element={<ConsoleDevices />} />
                  <Route path="ivrs" element={<ConsoleIVRs />} />
                  <Route path="ring-groups" element={<ConsoleRingGroups />} />
                  <Route path="queues" element={<ConsoleQueues />} />
                  <Route path="dids" element={<ConsoleDIDs />} />
                  <Route path="inbound-routes" element={<ConsoleInboundRoutes />} />
                  <Route path="voicemail" element={<ConsoleVoicemail />} />
                  <Route path="registrations" element={<ConsoleRegistrations />} />
                  <Route path="active-calls" element={<ConsoleActiveCalls />} />
                  <Route path="cdr" element={<ConsoleCdr />} />
                  <Route path="insights" element={<ConsoleInsights />} />
                  <Route path="chatbot" element={<ConsoleChatbot />} />
                  <Route path="audit" element={<ConsoleAudit />} />
                  <Route path="presence" element={<ConsolePresence />} />
                  <Route path="chat" element={<ConsoleChat />} />
                </Route>


                {/* Legacy /admin/* redirects → /platform/* */}
                <Route path="/admin" element={<Navigate to="/platform" replace />} />
                <Route path="/admin/users" element={<Navigate to="/platform/users" replace />} />
                <Route path="/admin/audit" element={<Navigate to="/platform/audit" replace />} />
                <Route path="/admin/organizations" element={<Navigate to="/platform/organizations" replace />} />
                <Route path="/admin/billing" element={<Navigate to="/platform/billing" replace />} />
                <Route path="/admin/system" element={<Navigate to="/platform/system" replace />} />
                <Route path="/admin/settings" element={<Navigate to="/platform/settings" replace />} />
                <Route path="/admin/*" element={<Navigate to="/platform" replace />} />

                {import.meta.env.DEV && <Route path="/_design" element={<DesignPreview />} />}

                <Route path="*" element={<NotFound />} />



              </Routes>
              {/* MascotProvider removed — MyAIChatLauncher is the single AVA assistant */}
            </Suspense>
          </OrganizationProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </LanguageProvider>
  </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
