import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useTelephonyStatus, type ServiceStatus } from '@/hooks/useTelephonyStatus';

function StatusPill({ name, s, settingsPath }: { name: string; s?: ServiceStatus; settingsPath: string }) {
  if (!s) return <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {name}</Badge>;
  const Icon = s.ok ? CheckCircle2 : XCircle;
  const variant = s.ok ? 'default' : 'destructive';
  const inner = (
    <Badge variant={variant} className="gap-1 cursor-pointer" title={s.error || s.detail || `${s.latency_ms ?? 0}ms`}>
      <Icon className="w-3 h-3" /> {name} {s.latency_ms != null && <span className="opacity-70">{s.latency_ms}ms</span>}
    </Badge>
  );
  return s.ok ? inner : <Link to={settingsPath}>{inner}</Link>;
}

export function ConnectionStatusBanner({ settingsPath = '/org/lemtel/telephony/settings' }: { settingsPath?: string }) {
  const { data, isLoading } = useTelephonyStatus();
  return (
    <div className="space-y-2">
      {data?.mock_mode && (
        <Alert className="border-yellow-500/40 bg-yellow-500/10">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-700 dark:text-yellow-400">
            ⚠️ Mock Data Mode Active — disable in <Link to={settingsPath} className="underline font-medium">PBX Settings</Link> before going live.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Connections:</span>
        {isLoading && !data ? (
          <Badge variant="outline" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Checking…</Badge>
        ) : (
          <>
            <StatusPill name="FusionPBX" s={data?.services.fusionpbx} settingsPath={settingsPath} />
            <StatusPill name="Telnyx" s={data?.services.telnyx} settingsPath={settingsPath} />
            <StatusPill name="ElevenLabs" s={data?.services.elevenlabs} settingsPath={settingsPath} />
            <StatusPill name="AI" s={data?.services.ai} settingsPath={settingsPath} />
          </>
        )}
      </div>
    </div>
  );
}
