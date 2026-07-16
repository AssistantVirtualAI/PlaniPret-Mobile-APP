import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Wrench } from 'lucide-react';

const AVAILABLE_TOOLS = [
  { id: 'calendar', label: 'Calendrier (RDV)' },
  { id: 'crm', label: 'CRM (Leads)' },
  { id: 'email', label: 'Envoyer Email' },
  { id: 'webhook', label: 'Webhook Externe' },
  { id: 'transfer', label: 'Transfert Humain' },
];

interface ToolsNodeProps {
  data: {
    enabledTools: string[];
    onToggleTool: (toolId: string) => void;
  };
}

export function ToolsNode({ data }: ToolsNodeProps) {
  const enabledTools = data.enabledTools || [];

  return (
    <Card className="w-64 border-2 border-purple-500/50 shadow-lg">
      <Handle type="target" position={Position.Top} className="!bg-purple-500 !w-3 !h-3" />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded bg-purple-500 text-white">
            <Wrench className="h-4 w-4" />
          </div>
          Outils Agent
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {AVAILABLE_TOOLS.map((tool) => (
          <div key={tool.id} className="flex items-center space-x-2">
            <Checkbox
              id={tool.id}
              checked={enabledTools.includes(tool.id)}
              onCheckedChange={() => data.onToggleTool(tool.id)}
            />
            <Label htmlFor={tool.id} className="text-xs cursor-pointer">
              {tool.label}
            </Label>
          </div>
        ))}
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!bg-purple-500 !w-3 !h-3" />
    </Card>
  );
}
