import { Handle, Position } from '@xyflow/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Mic } from 'lucide-react';

const VOICES = [
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
];

interface VoiceSettingsNodeProps {
  data: {
    voiceId: string;
    stability: number;
    similarity: number;
    onVoiceChange: (value: string) => void;
    onStabilityChange: (value: number) => void;
    onSimilarityChange: (value: number) => void;
  };
}

export function VoiceSettingsNode({ data }: VoiceSettingsNodeProps) {
  return (
    <Card className="w-72 border-2 border-amber-500/50 shadow-lg">
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3 !h-3" />
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className="p-1.5 rounded bg-amber-500 text-white">
            <Mic className="h-4 w-4" />
          </div>
          Voice Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Voice</Label>
          <Select value={data.voiceId || undefined} onValueChange={data.onVoiceChange}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Sélectionner une voix" />
            </SelectTrigger>
            <SelectContent>
              {VOICES.map((voice) => (
                <SelectItem key={voice.id} value={voice.id} className="text-xs">
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Stabilité: {Math.round((data.stability || 0.5) * 100)}%</Label>
          <Slider
            value={[(data.stability || 0.5) * 100]}
            onValueChange={([v]) => data.onStabilityChange(v / 100)}
            max={100}
            step={1}
            className="h-1"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Similarité: {Math.round((data.similarity || 0.75) * 100)}%</Label>
          <Slider
            value={[(data.similarity || 0.75) * 100]}
            onValueChange={([v]) => data.onSimilarityChange(v / 100)}
            max={100}
            step={1}
            className="h-1"
          />
        </div>
      </CardContent>
      <Handle type="source" position={Position.Bottom} className="!bg-amber-500 !w-3 !h-3" />
    </Card>
  );
}
