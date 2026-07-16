import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, RefreshCw } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { useRunSecurityAudit, useSecurityAuditRuns } from '@/hooks/useSecurityAudit';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CardFooter } from '@/components/ui/card';
import { useMemo, useState } from 'react';

type CheckStatus = 'pass' | 'fail' | 'warn';

const statusVariant = (s: CheckStatus | '—') => {
  if (s === 'pass') return 'default';
  if (s === 'fail') return 'destructive';
  return 'secondary';
};

export const SecurityAuditTab = () => {
  const { selectedOrgId } = useOrganization();
  const { can, isSuperAdmin } = usePermissions();
  const { toast } = useToast();
  const runsQuery = useSecurityAuditRuns(selectedOrgId || undefined);
  const runAudit = useRunSecurityAudit();
  const [dryRun, setDryRun] = useState(false);
  const [compareA, setCompareA] = useState<string>('');
  const [compareB, setCompareB] = useState<string>('');

  const canView = isSuperAdmin || can('read:security_audit');
  const canRun = isSuperAdmin || can('run:security_audit');

  const latest = runsQuery.data?.[0];
  const checks: Array<{ id: string; title: string; status: CheckStatus }> = latest?.results?.checks || [];

  const onRun = async () => {
    if (!selectedOrgId) return;
    try {
      const res = await runAudit.mutateAsync({ organizationId: selectedOrgId, dryRun });
      toast({
        title: 'Audit lancé',
        description: dryRun ? 'Audit terminé (dry-run: non enregistré).' : 'Audit terminé et enregistré.',
      });
      if (!dryRun && res?.run?.id) {
        // Reset compare selection to latest after a new persisted run
        setCompareA(res.run.id);
      }
    } catch (e: any) {
      toast({ title: 'Erreur', description: e?.message || 'Impossible d’exécuter l’audit', variant: 'destructive' });
    }
  };

  const runMap = useMemo(() => {
    const m = new Map<string, any>();
    (runsQuery.data || []).forEach((r) => m.set(r.id, r));
    return m;
  }, [runsQuery.data]);

  const diff = useMemo(() => {
    const a = compareA ? runMap.get(compareA) : null;
    const b = compareB ? runMap.get(compareB) : null;
    if (!a || !b) return [] as Array<{ id: string; title: string; a: string; b: string }>;

    const toMap = (run: any) => {
      const checks = ((run?.results?.checks as any[]) || []) as any[];
      return new Map<string, any>(checks.map((c: any) => [String(c.id), c]));
    };
    const am = toMap(a);
    const bm = toMap(b);
    const ids = new Set<string>([...am.keys(), ...bm.keys()]);
    const out: Array<{ id: string; title: string; a: string; b: string }> = [];
    ids.forEach((id) => {
      const ca = am.get(id);
      const cb = bm.get(id);
      const sa = (ca?.status as string | undefined) ?? '—';
      const sb = (cb?.status as string | undefined) ?? '—';
      if (sa !== sb) {
        out.push({ id, title: String(cb?.title || ca?.title || id), a: sa, b: sb });
      }
    });
    return out;
  }, [compareA, compareB, runMap]);

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Security Audit</CardTitle>
          <CardDescription>Disponible uniquement pour Admin/Manager.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Audit
              </CardTitle>
              <CardDescription>
                Dernier audit: {latest?.created_at ? new Date(latest.created_at).toLocaleString() : 'Aucun'}
              </CardDescription>
            </div>
             <Button onClick={onRun} disabled={!selectedOrgId || runAudit.isPending || !canRun} className="gap-2">
              <RefreshCw className={runAudit.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              Relancer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
            <div>
              <div className="text-sm font-medium">Dry-run</div>
              <div className="text-xs text-muted-foreground">Exécute l’audit sans l’enregistrer (et sans alertes).</div>
            </div>
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
          </div>
          <div className="text-xs text-muted-foreground">
            En cas d’échec, une alerte est envoyée (email + notification in-app) aux Admin/Manager.
          </div>
          {runsQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Chargement…</div>
          ) : !latest ? (
            <div className="text-sm text-muted-foreground">Aucun audit enregistré.</div>
          ) : checks.length === 0 ? (
            <div className="text-sm text-muted-foreground">Aucun check retourné.</div>
          ) : (
            <div className="space-y-2">
              {checks.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-3">
                  <div className="text-sm font-medium">{c.title}</div>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-3">
          <div className="text-sm font-medium">Comparer deux audits</div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            <Select value={compareA} onValueChange={setCompareA}>
              <SelectTrigger><SelectValue placeholder="Audit A" /></SelectTrigger>
              <SelectContent>
                {(runsQuery.data || []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {new Date(r.created_at).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={compareB} onValueChange={setCompareB}>
              <SelectTrigger><SelectValue placeholder="Audit B" /></SelectTrigger>
              <SelectContent>
                {(runsQuery.data || []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {new Date(r.created_at).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {compareA && compareB && (
            diff.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune différence.</div>
            ) : (
              <div className="w-full space-y-2">
                {diff.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="text-sm font-medium">{d.title}</div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={statusVariant(d.a as any)}>{d.a}</Badge>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant={statusVariant(d.b as any)}>{d.b}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

