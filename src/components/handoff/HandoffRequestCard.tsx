import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock, User, AlertCircle } from 'lucide-react';
import { HandoffRequest } from '@/hooks/useHandoffs';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface HandoffRequestCardProps {
  handoff: HandoffRequest;
  onAccept?: () => void;
  onReject?: () => void;
  isActive?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
}

const priorityColors = {
  low: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  normal: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  high: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  urgent: 'bg-red-500/10 text-red-500 border-red-500/20 animate-pulse',
};

export function HandoffRequestCard({
  handoff,
  onAccept,
  onReject,
  isActive,
  isSelected,
  onClick
}: HandoffRequestCardProps) {
  const timeAgo = formatDistanceToNow(new Date(handoff.requested_at), {
    addSuffix: true,
    locale: fr
  });

  return (
    <Card 
      className={`glass-card cursor-pointer transition-all ${
        isSelected ? 'ring-2 ring-primary' : 'hover:bg-accent/50'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-full bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">
                {handoff.customer_info?.name || 'Client anonyme'}
              </p>
              <p className="text-xs text-muted-foreground">{timeAgo}</p>
            </div>
          </div>
          <Badge className={priorityColors[handoff.priority]}>
            {handoff.priority === 'urgent' && <AlertCircle className="mr-1 h-3 w-3" />}
            {handoff.priority}
          </Badge>
        </div>

        {handoff.reason && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {handoff.reason}
          </p>
        )}

        {handoff.customer_info?.email && (
          <p className="text-xs text-muted-foreground mb-3">
            📧 {handoff.customer_info.email}
          </p>
        )}

        {!isActive && handoff.status === 'pending' && (
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onAccept?.();
              }}
            >
              <Check className="mr-1 h-4 w-4" />
              Accepter
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                onReject?.();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {isActive && (
          <div className="flex items-center gap-2 mt-3">
            <Badge variant="secondary" className="bg-green-500/10 text-green-500">
              <Clock className="mr-1 h-3 w-3" />
              En cours
            </Badge>
            <span className="text-xs text-muted-foreground">
              {handoff.chat_messages?.length || 0} messages
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
