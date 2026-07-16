import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { TEMPLATE_VARIABLES } from '@/hooks/useEmailTemplates';

interface VariablesHelperProps {
  onInsert?: (variable: string) => void;
}

export const VariablesHelper = ({ onInsert }: VariablesHelperProps) => {
  const copyVariable = (variable: string) => {
    navigator.clipboard.writeText(variable);
    toast.success('Variable copiée');
    onInsert?.(variable);
  };

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Variables disponibles</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {TEMPLATE_VARIABLES.map((v) => (
          <div 
            key={v.variable} 
            className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
          >
            <div>
              <code className="text-xs font-mono text-primary">{v.variable}</code>
              <p className="text-xs text-muted-foreground">{v.description}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => copyVariable(v.variable)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
