import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { List, AlertCircle, Frown, Calendar, Clock, Tag } from 'lucide-react';
import { type ViewPreset, VIEW_PRESETS } from '@/hooks/useConversationViews';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

const ICONS: Record<string, React.ElementType> = {
  list: List,
  'alert-circle': AlertCircle,
  frown: Frown,
  calendar: Calendar,
  clock: Clock,
  tag: Tag,
};

interface ConversationDataViewProps {
  activeView: ViewPreset;
  onViewChange: (view: ViewPreset) => void;
  counts?: Partial<Record<ViewPreset, number>>;
}

export function ConversationDataView({ activeView, onViewChange, counts }: ConversationDataViewProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-1.5">
      {VIEW_PRESETS.map((preset) => {
        const Icon = ICONS[preset.icon] || List;
        const isActive = activeView === preset.id;
        const count = counts?.[preset.id];

        return (
          <Button
            key={preset.id}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className={cn('gap-1.5 h-8 text-xs', isActive && 'shadow-sm')}
            onClick={() => onViewChange(preset.id)}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(preset.labelKey)}
            {count !== undefined && count > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px] leading-none">
                {count}
              </Badge>
            )}
          </Button>
        );
      })}
    </div>
  );
}
