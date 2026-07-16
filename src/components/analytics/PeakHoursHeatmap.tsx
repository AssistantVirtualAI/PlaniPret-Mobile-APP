import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

interface HeatmapData {
  /** 7 rows (days) × 24 cols (hours), value = conversation count */
  grid: number[][];
}

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function PeakHoursHeatmap({ data }: { data: HeatmapData }) {
  const { t, language } = useTranslation();
  const days = language === 'fr' ? DAYS_FR : DAYS_EN;
  const max = Math.max(1, ...data.grid.flat());

  const getOpacity = (val: number) => {
    if (val === 0) return 0.05;
    return 0.15 + (val / max) * 0.85;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t('analytics.peakHours.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            {/* Hour labels */}
            <div className="flex ml-10 mb-1">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">
                  {h}h
                </div>
              ))}
            </div>
            {/* Grid */}
            {data.grid.map((row, dayIndex) => (
              <div key={dayIndex} className="flex items-center gap-1 mb-0.5">
                <span className="w-9 text-right text-[10px] text-muted-foreground pr-1">{days[dayIndex]}</span>
                <div className="flex flex-1 gap-px">
                  {row.map((val, h) => (
                    <div
                      key={h}
                      className={cn('flex-1 h-5 rounded-sm')}
                      style={{
                        backgroundColor: `hsl(var(--primary))`,
                        opacity: getOpacity(val),
                      }}
                      title={`${days[dayIndex]} ${h}h: ${val}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
