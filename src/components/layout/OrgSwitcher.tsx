import { Building2, Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOrganization } from '@/context/OrganizationContext';
import { useTranslation } from '@/hooks/useTranslation';

export function OrgSwitcher() {
  const { organizations, organizationMemberships, selectedOrg, setSelectedOrgId } = useOrganization();
  const { t } = useTranslation();

  if (!organizations || organizations.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full justify-between gap-2 px-3 bg-background/50 hover:bg-muted"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="truncate text-xs font-medium">
              {selectedOrg?.name || t('settings.tabs.organizations') || 'Organization'}
            </span>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>{t('settings.tabs.organizations') || 'Organizations'}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organizations.map((org) => {
          const membership = organizationMemberships.find((item) => item.organization.id === org.id);
          return (
          <DropdownMenuItem
            key={org.id}
            onClick={() => setSelectedOrgId(org.id)}
            className="flex items-center gap-2"
          >
            <Check
              className={`w-4 h-4 ${selectedOrg?.id === org.id ? 'opacity-100' : 'opacity-0'}`}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{org.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{org.slug}</div>
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
              {membership?.role || 'member'}
            </Badge>
          </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          {organizationMemberships.length} org{organizationMemberships.length > 1 ? 's' : ''} linked to this user
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
