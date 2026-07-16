import { Badge } from '@/components/ui/badge';
import { Cloud, Database, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';

interface DataSourceIndicatorProps {
  source: 'elevenlabs' | 'local' | 'mixed';
  lastUpdated: string;
  isLoading?: boolean;
  onSync?: () => void;
}

export const DataSourceIndicator = ({ 
  source, 
  lastUpdated, 
  isLoading,
  onSync 
}: DataSourceIndicatorProps) => {
  const { t, language } = useTranslation();
  const dateLocale = language === 'fr' ? fr : enUS;

  const getSourceInfo = () => {
    switch (source) {
      case 'elevenlabs':
        return {
          icon: Cloud,
          label: t('dashboard.dataSource.connectedTo'),
          color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
          iconColor: 'text-emerald-500',
        };
      case 'mixed':
        return {
          icon: Database,
          label: t('dashboard.dataSource.mixedData'),
          color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
          iconColor: 'text-amber-500',
        };
      default:
        return {
          icon: Database,
          label: t('dashboard.dataSource.localData'),
          color: 'bg-muted text-muted-foreground border-border',
          iconColor: 'text-muted-foreground',
        };
    }
  };

  const info = getSourceInfo();
  const Icon = info.icon;
  const formattedDate = lastUpdated 
    ? format(new Date(lastUpdated), "d MMM HH:mm", { locale: dateLocale })
    : '';

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Badge 
        variant="outline" 
        className={`${info.color} gap-1.5 py-1 px-2.5`}
      >
        <Icon className={`h-3.5 w-3.5 ${info.iconColor}`} />
        {info.label}
      </Badge>
      
      {source === 'elevenlabs' && (
        <div className="flex items-center gap-1 text-xs text-emerald-500">
          <CheckCircle className="h-3 w-3" />
          <span>{t('dashboard.dataSource.syncActive')}</span>
        </div>
      )}
      
      {source === 'local' && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          <span>{t('dashboard.dataSource.configureElevenlabs')}</span>
        </div>
      )}

      <span className="text-xs text-muted-foreground">
        {t('dashboard.dataSource.updatedOn')} {formattedDate}
      </span>

      {onSync && (
        <button
          onClick={onSync}
          disabled={isLoading}
          className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          {t('dashboard.dataSource.synchronize')}
        </button>
      )}
    </div>
  );
};
