import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Probe = {
  host: string;
  port: number;
  url: string;
  ok: boolean;
  latency_ms: number;
  error: string | null;
};

type HealthResponse = {
  ok: boolean;
  checked_at: string;
  probes: Probe[];
  summary: { total: number; up: number; down: number; critical_failures: number };
};

// Targets the browser also probes directly to verify WebSocket upgrades from the client side.
const BROWSER_PROBES: Array<{ host: string; port: number }> = [
  { host: 'pbxnode.lemtel.tel', port: 7443 },
  { host: 'node.lemtelcloud.net', port: 7443 },
];

const BROWSER_TIMEOUT = 6000;

async function browserProbe(host: string, port: number): Promise<Probe> {
  const url = `wss://${host}:${port}`;
  const started = performance.now();
  return new Promise<Probe>((resolve) => {
    let settled = false;
    const finish = (ok: boolean, error: string | null) => {
      if (settled) return;
      settled = true;
      resolve({ host, port, url, ok, error, latency_ms: Math.round(performance.now() - started) });
    };
    try {
      const ws = new WebSocket(url, ['sip']);
      const timer = window.setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        finish(false, `timeout_${BROWSER_TIMEOUT}ms`);
      }, BROWSER_TIMEOUT);
      ws.onopen = () => {
        clearTimeout(timer);
        try { ws.close(1000, 'health-check'); } catch { /* ignore */ }
        finish(true, null);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        finish(false, 'ws_upgrade_failed');
      };
    } catch (e) {
      finish(false, e instanceof Error ? e.message : String(e));
    }
  });
}

export function WssHealthMonitor({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const [edge, setEdge] = useState<HealthResponse | null>(null);
  const [browser, setBrowser] = useState<Probe[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async (notify = false) => {
    setLoading(true);
    try {
      const [edgeRes, browserRes] = await Promise.all([
        supabase.functions.invoke<HealthResponse>('wss-health-check', { method: 'POST' }),
        Promise.all(BROWSER_PROBES.map((t) => browserProbe(t.host, t.port))),
      ]);
      if (edgeRes.error) throw edgeRes.error;
      setEdge(edgeRes.data ?? null);
      setBrowser(browserRes);

      const criticalEdge = edgeRes.data?.summary.critical_failures ?? 0;
      const criticalBrowser = browserRes.filter((p) => p.port === 7443 && !p.ok).length;
      if ((criticalEdge > 0 || criticalBrowser > 0) && notify) {
        toast.error(`WSS 7443 indisponible — ${criticalEdge} côté serveur, ${criticalBrowser} côté navigateur`);
      }
    } catch (err) {
      console.error('[wss-health-monitor] check failed', err);
      if (notify) toast.error('Échec du test de santé WSS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    run(false);
    const id = window.setInterval(() => run(true), intervalMs);
    return () => window.clearInterval(id);
  }, [run, intervalMs]);

  const renderProbe = (p: Probe) => {
    const isExpectedFail = p.port === 5067;
    const variant: 'default' | 'destructive' | 'secondary' =
      p.ok ? 'default' : isExpectedFail ? 'secondary' : 'destructive';
    const icon = p.ok ? <CheckCircle2 className="w-3 h-3" /> :
      isExpectedFail ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />;
    return (
      <div key={p.url} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
        <div className="min-w-0">
          <div className="font-medium truncate">{p.url}</div>
          <div className="text-xs text-muted-foreground">
            {p.ok ? `${p.latency_ms}ms` : (p.error || 'down')}
            {isExpectedFail && !p.ok && ' · attendu (port SIP/TLS, pas WSS)'}
          </div>
        </div>
        <Badge variant={variant} className="gap-1">{icon}{p.ok ? 'UP' : isExpectedFail ? 'N/A' : 'DOWN'}</Badge>
      </div>
    );
  };

  const criticalCount =
    (edge?.summary.critical_failures ?? 0) +
    (browser?.filter((p) => p.port === 7443 && !p.ok).length ?? 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            WSS endpoint health
            {criticalCount > 0 ? (
              <Badge variant="destructive">{criticalCount} critique{criticalCount > 1 ? 's' : ''}</Badge>
            ) : edge ? (
              <Badge variant="default">OK</Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Vérifie 7443 (WSS attendu) et 5067 (SIP/TLS, échec attendu). Auto-refresh {Math.round(intervalMs / 1000)}s.
            {edge?.checked_at && ` · Dernière vérification: ${new Date(edge.checked_at).toLocaleTimeString()}`}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => run(true)} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </CardHeader>
      <CardContent className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Côté serveur (edge)</div>
          {edge?.probes.map(renderProbe) ?? <div className="text-xs text-muted-foreground">Aucune donnée</div>}
        </div>
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Côté navigateur</div>
          {browser?.map(renderProbe) ?? <div className="text-xs text-muted-foreground">Test en cours…</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default WssHealthMonitor;
