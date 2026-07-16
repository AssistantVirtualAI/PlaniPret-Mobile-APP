import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotateCw, Smartphone, Sun, Moon, ExternalLink } from 'lucide-react';

export type DeviceKey = 'iphone15pro' | 'iphonese' | 'pixel8' | 'ipadmini';

export const DEVICES: Record<DeviceKey, { label: string; w: number; h: number; variant: 'ios' | 'android' }> = {
  iphone15pro: { label: 'iPhone 15 Pro', w: 390, h: 844, variant: 'ios' },
  iphonese:    { label: 'iPhone SE',     w: 375, h: 667, variant: 'ios' },
  pixel8:      { label: 'Pixel 8',       w: 412, h: 915, variant: 'android' },
  ipadmini:    { label: 'iPad mini',     w: 768, h: 1024, variant: 'ios' },
};

interface Props {
  device: DeviceKey;
  onDevice: (d: DeviceKey) => void;
  landscape: boolean;
  onToggleOrientation: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onReload: () => void;
  url: string;
}

export function DeviceToolbar({ device, onDevice, landscape, onToggleOrientation, theme, onToggleTheme, onReload, url }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-card border border-border rounded-lg">
      <Select value={device} onValueChange={(v) => onDevice(v as DeviceKey)}>
        <SelectTrigger className="w-[180px]">
          <Smartphone className="w-4 h-4 mr-2" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(DEVICES).map(([k, d]) => (
            <SelectItem key={k} value={k}>{d.label} · {d.w}×{d.h}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={onToggleOrientation}>
        {landscape ? 'Landscape' : 'Portrait'}
      </Button>

      <Button variant="outline" size="sm" onClick={onToggleTheme}>
        {theme === 'dark' ? <Moon className="w-4 h-4 mr-2" /> : <Sun className="w-4 h-4 mr-2" />}
        {theme}
      </Button>

      <Button variant="outline" size="sm" onClick={onReload}>
        <RotateCw className="w-4 h-4 mr-2" /> Reload
      </Button>

      <a href={url} target="_blank" rel="noreferrer" className="ml-auto">
        <Button variant="ghost" size="sm">
          <ExternalLink className="w-4 h-4 mr-2" /> Open in new tab
        </Button>
      </a>
    </div>
  );
}
