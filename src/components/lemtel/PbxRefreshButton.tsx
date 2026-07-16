import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { usePbxSync } from '@/hooks/usePbxData';

interface Props {
  kind: 'cdr' | 'config' | 'devices' | 'ivr-queues';
  label?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'default' | 'ghost';
}

export function PbxRefreshButton({ kind, label = 'Refresh from PBX', size = 'sm', variant = 'outline' }: Props) {
  const sync = usePbxSync();
  return (
    <Button variant={variant} size={size} onClick={() => sync.mutate(kind)} disabled={sync.isPending}>
      <RefreshCw className={`w-4 h-4 mr-2 ${sync.isPending ? 'animate-spin' : ''}`} />
      {label}
    </Button>
  );
}
