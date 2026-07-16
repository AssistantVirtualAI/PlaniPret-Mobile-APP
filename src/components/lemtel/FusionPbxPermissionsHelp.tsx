import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { useCallCenterRole } from '@/hooks/useCallCenterRole';

/**
 * Admin-only help panel describing the FusionPBX Group Manager permissions
 * required for the REST API user driving Lemtel (gateways, call center, tiers…).
 * Hidden from agents/supervisors/viewers.
 */
export function FusionPbxPermissionsHelp({ area }: { area?: 'gateways' | 'queues' | 'all' }) {
  const { isSuperAdmin, isLemtelAdmin, isOrgAdmin, isAdmin, loading } = useCallCenterRole();
  const canSee = isSuperAdmin || isLemtelAdmin || isOrgAdmin || isAdmin;
  const [open, setOpen] = useState(false);
  if (loading || !canSee) return null;

  const groups: Record<string, string[]> = {
    Gateways: ['gateway_view', 'gateway_all', 'gateway_add', 'gateway_edit', 'gateway_delete', 'command_add', 'command_edit'],
    'Call Center': ['call_center_queue_view', 'call_center_queue_all', 'call_center_queue_add', 'call_center_queue_edit', 'call_center_queue_delete'],
    'Queue Tiers (agents)': ['call_center_tier_view', 'call_center_tier_all', 'call_center_tier_add', 'call_center_tier_edit', 'call_center_tier_delete'],
    'FS commands (fallback)': ['command_add', 'command_edit'],
  };

  const showGroups = area === 'gateways'
    ? { Gateways: groups.Gateways, 'FS commands (fallback)': groups['FS commands (fallback)'] }
    : area === 'queues'
    ? { 'Call Center': groups['Call Center'], 'Queue Tiers (agents)': groups['Queue Tiers (agents)'], 'FS commands (fallback)': groups['FS commands (fallback)'] }
    : groups;

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-2">
        <button className="flex items-center gap-2 text-left w-full" onClick={() => setOpen(v => !v)}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <ShieldAlert className="w-4 h-4 text-amber-600" />
          <CardTitle className="text-sm">FusionPBX permissions requises pour l'API user (admin only)</CardTitle>
          <Badge variant="outline" className="ml-auto text-[10px]">Aide admin</Badge>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="text-xs space-y-3 text-muted-foreground">
          <p>
            Certaines actions (gateways globales, ajout d'agents à une file) échouent si l'utilisateur API FusionPBX
            n'a pas les bonnes permissions. Le proxy tente automatiquement un fallback <code>fs_cli</code> quand la REST
            renvoie <code>403</code> — les logs de l'edge function <code>fusionpbx-proxy</code> tracent chaque fallback
            (<code>[fs_cli-fallback]</code>) avec l'action et la raison.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(showGroups).map(([label, perms]) => (
              <div key={label} className="rounded border border-border/50 p-2 bg-background/60">
                <div className="font-medium text-foreground mb-1">{label}</div>
                <div className="flex flex-wrap gap-1">
                  {perms.map(p => (
                    <code key={p} className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{p}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="rounded border border-border/50 p-2 bg-background/60">
            <div className="font-medium text-foreground mb-1">Comment les appliquer</div>
            <ol className="list-decimal pl-4 space-y-0.5">
              <li>FusionPBX → <b>Advanced → Group Manager</b>.</li>
              <li>Ouvrir le groupe de l'utilisateur API (ex. <code>superadmin</code>).</li>
              <li>Onglet <b>Permissions</b> → cocher les permissions ci-dessus.</li>
              <li>Sauvegarder puis cliquer <b>Refresh</b> sur cette page.</li>
              <li>Si un fallback <code>fs_cli</code> est utilisé, il apparaîtra dans un toast + dans les logs edge.</li>
            </ol>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Fermer</Button>
        </CardContent>
      )}
    </Card>
  );
}

export default FusionPbxPermissionsHelp;
