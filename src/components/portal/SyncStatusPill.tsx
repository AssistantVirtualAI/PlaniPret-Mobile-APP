import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useSyncStatus } from '@/hooks/useSyncStatus';

export function SyncStatusPill() {
  const { latest, syncing, syncNow } = useSyncStatus();
  const color =
    syncing || latest?.status === 'running' ? 'bg-yellow-500' :
    latest?.status === 'error' ? 'bg-red-500' : 'bg-green-500';
  const label =
    syncing ? 'Syncing…' :
    latest?.status === 'error' ? `Sync failed ${latest.completed_at ? formatDistanceToNow(new Date(latest.completed_at), { addSuffix: true }) : ''}` :
    latest?.completed_at ? `FusionPBX synced ${formatDistanceToNow(new Date(latest.completed_at), { addSuffix: true })}` :
    'Awaiting first sync';

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="gap-2">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {label}
      </Badge>
      <Button size="sm" variant="outline" onClick={() => syncNow('all')} disabled={syncing}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} />
        Sync Now
      </Button>
    </div>
  );
}
