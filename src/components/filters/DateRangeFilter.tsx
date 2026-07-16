import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export type DateRangePreset = 'today' | '7days' | '30days' | 'thisMonth' | 'lastMonth' | 'custom';

interface DateRangeFilterProps {
  value: { start: Date; end: Date } | null;
  onChange: (range: { start: Date; end: Date } | null) => void;
  className?: string;
}

export const DateRangeFilter = ({ value, onChange, className }: DateRangeFilterProps) => {
  const [preset, setPreset] = useState<DateRangePreset>('7days');
  const [isCustomOpen, setIsCustomOpen] = useState(false);

  const handlePresetChange = (newPreset: DateRangePreset) => {
    setPreset(newPreset);
    const now = new Date();
    
    switch (newPreset) {
      case 'today':
        onChange({ start: new Date(now.setHours(0, 0, 0, 0)), end: new Date() });
        break;
      case '7days':
        onChange({ start: subDays(now, 7), end: new Date() });
        break;
      case '30days':
        onChange({ start: subDays(now, 30), end: new Date() });
        break;
      case 'thisMonth':
        onChange({ start: startOfMonth(now), end: endOfMonth(now) });
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        onChange({ start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) });
        break;
      case 'custom':
        setIsCustomOpen(true);
        break;
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Select value={preset} onValueChange={(v) => handlePresetChange(v as DateRangePreset)}>
        <SelectTrigger className="w-[180px]">
          <CalendarIcon className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Période" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Aujourd'hui</SelectItem>
          <SelectItem value="7days">7 derniers jours</SelectItem>
          <SelectItem value="30days">30 derniers jours</SelectItem>
          <SelectItem value="thisMonth">Ce mois</SelectItem>
          <SelectItem value="lastMonth">Mois dernier</SelectItem>
          <SelectItem value="custom">Personnalisé</SelectItem>
        </SelectContent>
      </Select>

      {preset === 'custom' && (
        <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              {value ? (
                <>
                  {format(value.start, 'dd/MM/yyyy', { locale: fr })} - {format(value.end, 'dd/MM/yyyy', { locale: fr })}
                </>
              ) : (
                "Personnalisé"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="flex gap-2 p-4">
              <div>
                <p className="text-sm font-medium mb-2">Du</p>
                <Calendar
                  mode="single"
                  selected={value?.start}
                  onSelect={(date) => {
                    if (date) {
                      onChange({ 
                        start: date, 
                        end: value?.end || new Date() 
                      });
                    }
                  }}
                  locale={fr}
                />
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Au</p>
                <Calendar
                  mode="single"
                  selected={value?.end}
                  onSelect={(date) => {
                    if (date) {
                      onChange({ 
                        start: value?.start || date, 
                        end: date 
                      });
                    }
                  }}
                  locale={fr}
                />
              </div>
            </div>
            <div className="border-t p-2 flex justify-end">
              <Button size="sm" onClick={() => setIsCustomOpen(false)}>
                Appliquer
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};
