import {
  Activity,
  Headphones,
  PhoneCall,
  Voicemail,
  Sparkles,
  Plus,
} from "lucide-react";
import {
  GlassCard,
  KpiCard,
  StatusChip,
  NeonButton,
  LiveBadge,
  SectionHeader,
  EmptyStateBranded,
  GlassTable,
  GTHead,
  GTHeadCell,
  GTRow,
  GTCell,
} from "@/components/ui-cockpit";
import { CockpitShell } from "@/components/cockpit/CockpitShell";

export default function DesignPreview() {
  if (!import.meta.env.DEV) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Available in development only.
      </div>
    );
  }

  return (
    <CockpitShell
      header={
        <SectionHeader
          icon={<Sparkles className="h-5 w-5" />}
          title="Cockpit Design System"
          subtitle="Phase 1 + 2 — glass shell, role nav, live badges, primitives."
          actions={
            <>
              <NeonButton variant="outline" size="sm">Secondary</NeonButton>
              <NeonButton size="sm"><Plus className="h-4 w-4" /> Primary</NeonButton>
            </>
          }
        />
      }
    >
      <div className="space-y-8">


      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active calls" value={12} icon={<PhoneCall className="h-4 w-4" />} accent="cyan" live trend={{ value: 8, label: "vs last hour" }} />
        <KpiCard label="Online agents" value="34 / 42" icon={<Headphones className="h-4 w-4" />} accent="violet" />
        <KpiCard label="Unread voicemail" value={5} icon={<Voicemail className="h-4 w-4" />} accent="warning" />
        <KpiCard label="System health" value="OK" icon={<Activity className="h-4 w-4" />} accent="success" hint="All sync jobs nominal" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard className="p-5 space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Status chips</h3>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="success" pulse>Connected</StatusChip>
            <StatusChip tone="warning">Sync pending</StatusChip>
            <StatusChip tone="danger" pulse>PBX down</StatusChip>
            <StatusChip tone="idle">Idle</StatusChip>
            <StatusChip tone="cyan">Live</StatusChip>
            <StatusChip tone="violet">AI</StatusChip>
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-3" glow="cyan">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Buttons</h3>
          <div className="flex flex-wrap gap-2">
            <NeonButton>Primary</NeonButton>
            <NeonButton variant="outline">Outline</NeonButton>
            <NeonButton variant="ghost">Ghost</NeonButton>
            <NeonButton variant="danger">Danger</NeonButton>
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-3" variant="neon" scan>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Live badges</h3>
          <div className="flex flex-wrap gap-2">
            <LiveBadge count={12} />
            <LiveBadge tone="warning" label="ALERT" count={3} />
            <LiveBadge tone="danger" label="DOWN" />
            <LiveBadge tone="success" label="OK" />
          </div>
        </GlassCard>
      </section>

      <section>
        <GlassTable>
          <GTHead>
            <GTRow>
              <GTHeadCell>Caller</GTHeadCell>
              <GTHeadCell>Extension</GTHeadCell>
              <GTHeadCell>Status</GTHeadCell>
              <GTHeadCell>Duration</GTHeadCell>
            </GTRow>
          </GTHead>
          <tbody>
            {["Alice", "Bob", "Charlie"].map((n, i) => (
              <GTRow key={n}>
                <GTCell>{n}</GTCell>
                <GTCell className="font-mono">10{i + 1}</GTCell>
                <GTCell><StatusChip tone={i === 1 ? "warning" : "success"} pulse>{i === 1 ? "Ringing" : "On call"}</StatusChip></GTCell>
                <GTCell className="font-mono">0{i + 1}:24</GTCell>
              </GTRow>
            ))}
          </tbody>
        </GlassTable>
      </section>

      <section>
        <EmptyStateBranded
          icon={<Voicemail className="h-6 w-6" />}
          title="No voicemails yet"
          description="When callers leave a message, AI summaries appear here with follow-up actions."
          action={<NeonButton size="sm">Configure greeting</NeonButton>}
        />
      </section>
      </div>
    </CockpitShell>
  );
}

