import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Phone, PhoneOff, MessageSquare, Calendar, Zap } from 'lucide-react';

const triggerIcons: Record<string, React.ReactNode> = {
  'call-started': <Phone className="h-4 w-4" />,
  'call-ended': <PhoneOff className="h-4 w-4" />,
  'message-received': <MessageSquare className="h-4 w-4" />,
  'appointment-booked': <Calendar className="h-4 w-4" />,
  'default': <Zap className="h-4 w-4" />
};

const triggerLabels: Record<string, string> = {
  'call-started': 'Appel démarré',
  'call-ended': 'Appel terminé',
  'message-received': 'Message reçu',
  'appointment-booked': 'RDV réservé'
};

function TriggerNode({ data }: NodeProps) {
  const triggerType = data?.triggerType as string || 'default';
  const icon = triggerIcons[triggerType] || triggerIcons['default'];
  const label = triggerLabels[triggerType] || (data?.label as string) || 'Trigger';

  return (
    <div className="px-4 py-3 shadow-lg rounded-lg border-2 border-green-500 bg-green-500/10 min-w-[160px]">
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-green-500 text-white">
          {icon}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-green-600 font-medium">Trigger</p>
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(TriggerNode);
