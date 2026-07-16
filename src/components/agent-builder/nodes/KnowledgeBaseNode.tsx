import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Plus, X } from 'lucide-react';

interface KnowledgeBaseNodeProps {
  data: {
    items: string[];
    onAddItem: () => void;
    onRemoveItem: (index: number) => void;
  };
}

export function KnowledgeBaseNode({ data }: KnowledgeBaseNodeProps) {
  return (
    <Card className="w-72 border-2 border-cyan-500/50 shadow-lg">
      <Handle type="target" position={Position.Top} className="!bg-cyan-500 !w-3 !h-3" />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded bg-cyan-500 text-white">
            <BookOpen className="h-4 w-4" />
          </div>
          Base de Connaissances
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <div className="flex flex-wrap gap-1">
          {(data.items || []).map((item, index) => (
            <Badge key={index} variant="secondary" className="text-xs gap-1">
              {item}
              <X 
                className="h-3 w-3 cursor-pointer hover:text-destructive" 
                onClick={() => data.onRemoveItem(index)}
              />
            </Badge>
          ))}
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full h-7 text-xs"
          onClick={data.onAddItem}
        >
          <Plus className="h-3 w-3 mr-1" />
          Ajouter une source
        </Button>
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!bg-cyan-500 !w-3 !h-3" />
    </Card>
  );
}
