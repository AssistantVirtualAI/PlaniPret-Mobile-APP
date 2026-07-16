import { useState, useMemo } from 'react';
import { subDays } from 'date-fns';

export type ViewPreset = 'all' | 'unresolved' | 'negative' | 'this_week' | 'high_duration' | 'tagged';

export interface ConversationFilters {
  resolution_status?: string;
  sentiment?: string;
  date_from?: string;
  min_duration?: number;
  has_tags?: boolean;
}

export const VIEW_PRESETS: Array<{ id: ViewPreset; labelKey: string; icon: string }> = [
  { id: 'all', labelKey: 'dataView.presets.all', icon: 'list' },
  { id: 'unresolved', labelKey: 'dataView.presets.unresolved', icon: 'alert-circle' },
  { id: 'negative', labelKey: 'dataView.presets.negative', icon: 'frown' },
  { id: 'this_week', labelKey: 'dataView.presets.thisWeek', icon: 'calendar' },
  { id: 'high_duration', labelKey: 'dataView.presets.highDuration', icon: 'clock' },
  { id: 'tagged', labelKey: 'dataView.presets.tagged', icon: 'tag' },
];

export const useConversationViews = () => {
  const [activeView, setActiveView] = useState<ViewPreset>('all');

  const filters = useMemo((): ConversationFilters => {
    switch (activeView) {
      case 'unresolved':
        return { resolution_status: 'pending' };
      case 'negative':
        return { sentiment: 'negative' };
      case 'this_week':
        return { date_from: subDays(new Date(), 7).toISOString() };
      case 'high_duration':
        return { min_duration: 300 }; // 5+ minutes
      case 'tagged':
        return { has_tags: true };
      default:
        return {};
    }
  }, [activeView]);

  return { activeView, setActiveView, filters };
};
