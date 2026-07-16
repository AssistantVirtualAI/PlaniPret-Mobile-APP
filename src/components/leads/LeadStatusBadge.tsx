import { Badge } from '@/components/ui/badge';

interface LeadStatusBadgeProps {
  status: 'new' | 'qualified' | 'contacted' | 'converted' | 'lost';
}

const statusConfig = {
  new: { label: 'Nouveau', variant: 'default' as const, className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  qualified: { label: 'Qualifié', variant: 'default' as const, className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  contacted: { label: 'Contacté', variant: 'default' as const, className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  converted: { label: 'Converti', variant: 'default' as const, className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  lost: { label: 'Perdu', variant: 'default' as const, className: 'bg-red-500/20 text-red-400 border-red-500/30' },
};

export function LeadStatusBadge({ status }: LeadStatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
