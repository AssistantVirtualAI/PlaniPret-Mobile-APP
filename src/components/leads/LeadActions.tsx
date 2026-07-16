import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, UserCheck, Phone, Trophy, XCircle, Trash2 } from 'lucide-react';
import { Lead, useLeads } from '@/hooks/useLeads';

interface LeadActionsProps {
  lead: Lead;
}

export function LeadActions({ lead }: LeadActionsProps) {
  const { updateLead, deleteLead } = useLeads();

  const handleStatusChange = async (status: Lead['status']) => {
    await updateLead.mutateAsync({ id: lead.id, status });
  };

  const handleDelete = async () => {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce lead ?')) {
      await deleteLead.mutateAsync(lead.id);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {lead.status !== 'qualified' && (
          <DropdownMenuItem onClick={() => handleStatusChange('qualified')}>
            <UserCheck className="mr-2 h-4 w-4 text-yellow-500" />
            Qualifier
          </DropdownMenuItem>
        )}
        {lead.status !== 'contacted' && (
          <DropdownMenuItem onClick={() => handleStatusChange('contacted')}>
            <Phone className="mr-2 h-4 w-4 text-purple-500" />
            Marquer contacté
          </DropdownMenuItem>
        )}
        {lead.status !== 'converted' && (
          <DropdownMenuItem onClick={() => handleStatusChange('converted')}>
            <Trophy className="mr-2 h-4 w-4 text-green-500" />
            Convertir
          </DropdownMenuItem>
        )}
        {lead.status !== 'lost' && (
          <DropdownMenuItem onClick={() => handleStatusChange('lost')}>
            <XCircle className="mr-2 h-4 w-4 text-red-500" />
            Marquer perdu
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
