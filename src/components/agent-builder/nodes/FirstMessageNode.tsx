import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MessageCircle } from 'lucide-react';

interface FirstMessageNodeProps {
  data: {
    message: string;
    onChange: (value: string) => void;
  };
}

export function FirstMessageNode({ data }: FirstMessageNodeProps) {
  return (
    <Card className="w-72 border-2 border-green-500/50 shadow-lg">
      <Handle type="target" position={Position.Top} className="!bg-green-500 !w-3 !h-3" />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded bg-green-500 text-white">
            <MessageCircle className="h-4 w-4" />
          </div>
          Premier Message
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Input
          placeholder="Bonjour ! Comment puis-je vous aider ?"
          value={data.message || ''}
          onChange={(e) => data.onChange(e.target.value)}
          className="text-xs"
        />
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!bg-green-500 !w-3 !h-3" />
    </Card>
  );
}
