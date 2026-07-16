import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Lead } from '@/hooks/useLeads';
import { LeadStatusBadge } from './LeadStatusBadge';
import { LeadActions } from './LeadActions';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface LeadsTableProps {
  leads: Lead[];
}

export function LeadsTable({ leads }: LeadsTableProps) {
  if (leads.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Aucun lead trouvé
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card/50">
            <TableHead>Nom</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Téléphone</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => (
            <TableRow key={lead.id} className="hover:bg-card/30">
              <TableCell className="font-medium">
                {lead.name || '-'}
              </TableCell>
              <TableCell>{lead.email || '-'}</TableCell>
              <TableCell>{lead.phone || '-'}</TableCell>
              <TableCell>
                <LeadStatusBadge status={lead.status} />
              </TableCell>
              <TableCell>
                <span className="font-semibold">{lead.score}</span>
              </TableCell>
              <TableCell>{lead.source || '-'}</TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(lead.created_at), 'dd MMM yyyy', { locale: fr })}
              </TableCell>
              <TableCell className="text-right">
                <LeadActions lead={lead} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
