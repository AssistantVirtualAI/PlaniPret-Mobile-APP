import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings2 } from 'lucide-react';

interface ResponseSettingsNodeProps {
  data: {
    temperature: number;
    maxTokens: number;
    onTemperatureChange: (value: number) => void;
    onMaxTokensChange: (value: number) => void;
  };
}

export function ResponseSettingsNode({ data }: ResponseSettingsNodeProps) {
  return (
    <Card className="w-64 border-2 border-rose-500/50 shadow-lg">
      <Handle type="target" position={Position.Top} className="!bg-rose-500 !w-3 !h-3" />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded bg-rose-500 text-white">
            <Settings2 className="h-4 w-4" />
          </div>
          Response Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">
            Temperature: {(data.temperature || 0.7).toFixed(1)}
          </Label>
          <Slider
            value={[(data.temperature || 0.7) * 100]}
            onValueChange={([v]) => data.onTemperatureChange(v / 100)}
            max={100}
            step={1}
            className="h-1"
          />
          <p className="text-[10px] text-muted-foreground">
            Bas = précis, Haut = créatif
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max Tokens</Label>
          <Input
            type="number"
            value={data.maxTokens || 150}
            onChange={(e) => data.onMaxTokensChange(parseInt(e.target.value) || 150)}
            className="h-7 text-xs"
            min={50}
            max={4000}
          />
        </div>
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!bg-rose-500 !w-3 !h-3" />
    </Card>
  );
}
