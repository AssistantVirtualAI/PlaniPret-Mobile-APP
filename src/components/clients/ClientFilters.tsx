import { Search, ArrowUpDown, Filter, X, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";

export type StatusFilter = "all" | "active" | "inactive";
export type SortField = "name" | "created_at" | "status";
export type SortOrder = "asc" | "desc";

interface ClientFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  totalCount: number;
  filteredCount: number;
}

export const ClientFilters = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortField,
  sortOrder,
  onSortChange,
  totalCount,
  filteredCount,
}: ClientFiltersProps) => {
  const hasActiveFilters = statusFilter !== "all" || search.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Premium Search Input */}
        <div className="relative flex-1 group">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 -z-10 blur-xl" />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Rechercher par nom ou email..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-11 h-12 bg-card/50 border-border/50 rounded-xl shadow-sm hover:shadow-md focus:shadow-lg transition-all duration-300 focus:border-primary/50"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onSearchChange("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(v) => onStatusFilterChange(v as StatusFilter)}>
          <SelectTrigger className="w-[200px] h-12 bg-card/50 border-border/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <SelectValue placeholder="Filtrer par statut" />
            </div>
          </SelectTrigger>
          <SelectContent className="rounded-xl border-border/50 shadow-xl">
            <SelectItem value="all" className="rounded-lg">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />
                Tous les clients
              </span>
            </SelectItem>
            <SelectItem value="active" className="rounded-lg">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Actifs uniquement
              </span>
            </SelectItem>
            <SelectItem value="inactive" className="rounded-lg">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                Inactifs uniquement
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              variant="outline" 
              className="h-12 gap-2 px-5 bg-card/50 border-border/50 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 hover:bg-card"
            >
              <ArrowUpDown className="w-4 h-4" />
              Trier
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl border-border/50 shadow-xl p-2">
            <DropdownMenuRadioGroup
              value={`${sortField}-${sortOrder}`}
              onValueChange={(value) => {
                const [field, order] = value.split("-") as [SortField, SortOrder];
                onSortChange(field, order);
              }}
            >
              <DropdownMenuRadioItem value="name-asc" className="rounded-lg">
                Nom (A → Z)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name-desc" className="rounded-lg">
                Nom (Z → A)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="created_at-desc" className="rounded-lg">
                Plus récent
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="created_at-asc" className="rounded-lg">
                Plus ancien
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="status-asc" className="rounded-lg">
                Statut (Actif → Inactif)
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="status-desc" className="rounded-lg">
                Statut (Inactif → Actif)
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Results count with active filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-2 bg-card/50 rounded-xl border border-border/30">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">
            {filteredCount === totalCount
              ? `${totalCount} client${totalCount > 1 ? "s" : ""}`
              : `${filteredCount} sur ${totalCount} client${totalCount > 1 ? "s" : ""}`}
          </span>
        </div>
        
        <AnimatePresence mode="popLayout">
          {statusFilter !== "all" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Badge 
                variant="secondary" 
                className="gap-2 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg cursor-pointer transition-colors"
                onClick={() => onStatusFilterChange("all")}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${statusFilter === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                {statusFilter === "active" ? "Actifs" : "Inactifs"}
                <X className="h-3 w-3 hover:text-destructive transition-colors" />
              </Badge>
            </motion.div>
          )}
          
          {search && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Badge 
                variant="secondary" 
                className="gap-2 px-3 py-1.5 bg-secondary/50 hover:bg-secondary/70 rounded-lg cursor-pointer transition-colors"
                onClick={() => onSearchChange("")}
              >
                <Search className="h-3 w-3" />
                "{search}"
                <X className="h-3 w-3 hover:text-destructive transition-colors" />
              </Badge>
            </motion.div>
          )}
        </AnimatePresence>
        
        {hasActiveFilters && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive text-xs"
              onClick={() => {
                onSearchChange("");
                onStatusFilterChange("all");
              }}
            >
              Réinitialiser tout
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
};