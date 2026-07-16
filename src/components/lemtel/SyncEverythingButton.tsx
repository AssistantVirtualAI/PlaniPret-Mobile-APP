import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { usePbxSync } from '@/hooks/usePbxData';

export function SyncEverythingButton({ size = 'sm' }: { size?: 'sm' | 'default' }) {
  const sync = usePbxSync();
  return (
    <Button
      size={size}
      onClick={() =>
        sync.mutate({
          kind: 'all',
          resources: ['extensions', 'users', 'devices', 'ivr_menus', 'call_center_queues', 'ring_groups', 'phone_numbers', 'cdrs', 'recordings'],
        })
      }
      disabled={sync.isPending}
      className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md"
    >
      <RefreshCw className={`w-4 h-4 mr-2 ${sync.isPending ? 'animate-spin' : ''}`} />
      {sync.isPending ? 'Syncing…' : 'Sync Everything'}
    </Button>
  );
}
