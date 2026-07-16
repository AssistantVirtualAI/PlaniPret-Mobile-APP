import { useState } from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ConversationFilters as Filters } from '@/hooks/useAllAgentsConversations';

interface Agent {
  id: string;
  name: string;
  agentId: string;
  conversationCount?: number;
}

interface ConversationFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  agents: Agent[];
  onSearch: (search: string) => void;
}

export function ConversationFilters({
  filters,
  onFiltersChange,
  agents,
  onSearch,
}: ConversationFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search || '');
  const [durationRange, setDurationRange] = useState<[number, number]>([
    filters.minDuration || 0,
    filters.maxDuration || 600,
  ]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(
    filters.dateFrom ? new Date(filters.dateFrom) : undefined
  );
  const [dateTo, setDateTo] = useState<Date | undefined>(
    filters.dateTo ? new Date(filters.dateTo) : undefined
  );

  const handleSearchSubmit = () => {
    onSearch(searchValue);
    onFiltersChange({ ...filters, search: searchValue });
  };

  const handleAgentChange = (value: string) => {
    onFiltersChange({ ...filters, agentId: value === 'all' ? undefined : value });
  };

  const handleDurationChange = (values: number[]) => {
    setDurationRange([values[0], values[1]]);
  };

  const handleDurationCommit = () => {
    onFiltersChange({
      ...filters,
      minDuration: durationRange[0] > 0 ? durationRange[0] : undefined,
      maxDuration: durationRange[1] < 600 ? durationRange[1] : undefined,
    });
  };

  const handleDateFromChange = (date: Date | undefined) => {
    setDateFrom(date);
    onFiltersChange({
      ...filters,
      dateFrom: date?.toISOString(),
    });
  };

  const handleDateToChange = (date: Date | undefined) => {
    setDateTo(date);
    onFiltersChange({
      ...filters,
      dateTo: date?.toISOString(),
    });
  };

  const clearFilters = () => {
    setSearchValue('');
    setDurationRange([0, 600]);
    setDateFrom(undefined);
    setDateTo(undefined);
    onFiltersChange({});
    onSearch('');
  };

  const activeFiltersCount = [
    filters.agentId,
    filters.search,
    filters.minDuration,
    filters.maxDuration,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="flex-1 min-w-64 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Rechercher dans les transcriptions..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
            className="pl-10 glass-card"
          />
        </div>

        {/* Agent Filter */}
        <Select
          value={filters.agentId || 'all'}
          onValueChange={handleAgentChange}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tous les agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les agents</SelectItem>
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                <div className="flex items-center justify-between gap-2">
                  <span>{agent.name}</span>
                  {agent.conversationCount !== undefined && (
                    <Badge variant="secondary" className="text-xs">
                      {agent.conversationCount}
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Duration Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Durée
              {(filters.minDuration || filters.maxDuration) && (
                <Badge variant="secondary" className="text-xs">
                  {formatDuration(filters.minDuration || 0)} - {formatDuration(filters.maxDuration || 600)}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-4">
              <h4 className="font-medium">Filtrer par durée</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{formatDuration(durationRange[0])}</span>
                  <span>{formatDuration(durationRange[1])}</span>
                </div>
                <Slider
                  value={durationRange}
                  onValueChange={handleDurationChange}
                  onValueCommit={handleDurationCommit}
                  max={600}
                  step={10}
                  className="w-full"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Date From */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              Du
              {dateFrom && (
                <Badge variant="secondary" className="text-xs">
                  {format(dateFrom, 'dd/MM/yy', { locale: fr })}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={handleDateFromChange}
              locale={fr}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Date To */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              Au
              {dateTo && (
                <Badge variant="secondary" className="text-xs">
                  {format(dateTo, 'dd/MM/yy', { locale: fr })}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={handleDateToChange}
              locale={fr}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        {/* Clear Filters */}
        {activeFiltersCount > 0 && (
          <Button variant="ghost" onClick={clearFilters} className="gap-2">
            <X className="w-4 h-4" />
            Effacer ({activeFiltersCount})
          </Button>
        )}
      </div>
    </div>
  );
}
