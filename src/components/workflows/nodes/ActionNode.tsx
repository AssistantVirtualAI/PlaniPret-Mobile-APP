import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Mail, MessageSquare, UserPlus, Bell, Database, Webhook } from 'lucide-react';

const actionIcons: Record<string, React.ReactNode> = {
  'send-email': <Mail className="h-4 w-4" />,
  'send-sms': <MessageSquare className="h-4 w-4" />,
  'create-lead': <UserPlus className="h-4 w-4" />,
  'notify-slack': <Bell className="h-4 w-4" />,
  'update-crm': <Database className="h-4 w-4" />,
  'webhook': <Webhook className="h-4 w-4" />,
  'default': <Webhook className="h-4 w-4" />
};

const actionLabels: Record<string, string> = {
  'send-email': 'Send Email',
  'send-sms': 'Send SMS',
  'create-lead': 'Create Lead',
  'notify-slack': 'Notify Slack',
  'update-crm': 'Update CRM',
  'webhook': 'Webhook'
};

function ActionNode({ data }: NodeProps) {
  const actionType = data?.actionType as string || 'default';
  const icon = actionIcons[actionType] || actionIcons['default'];
  const label = actionLabels[actionType] || (data?.label as string) || 'Action';

  return (
    <div className="px-4 py-3 shadow-lg rounded-lg border-2 border-blue-500 bg-blue-500/10 min-w-[160px]">
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-blue-500 text-white">
          {icon}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-blue-600 font-medium">Action</p>
          <p className="text-sm font-medium text-foreground">{label}</p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(ActionNode);
