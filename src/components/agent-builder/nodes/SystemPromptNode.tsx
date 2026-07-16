import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';

interface SystemPromptNodeProps {
  data: {
    prompt: string;
    onChange: (value: string) => void;
  };
}

export function SystemPromptNode({ data }: SystemPromptNodeProps) {
  return (
    <Card className="w-80 border-2 border-primary/50 shadow-lg">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded bg-primary text-primary-foreground">
            <MessageSquare className="h-4 w-4" />
          </div>
          System Prompt
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Textarea
          placeholder="Définissez la personnalité et les instructions de l'agent..."
          value={data.prompt || ''}
          onChange={(e) => data.onChange(e.target.value)}
          className="min-h-[100px] text-xs resize-none"
        />
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-3 !h-3" />
    </Card>
  );
}
