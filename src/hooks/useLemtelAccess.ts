import { useOrganization } from '@/context/OrganizationContext';
import { usePermissions } from '@/hooks/usePermissions';

export const LEMTEL_ORG_ID = '71755d33-ed64-4ad5-a828-61c9d2029eb7';

export function useLemtelAccess() {
  const { selectedOrgId, organizationMemberships, isSuperAdmin } = useOrganization();
  const { role } = usePermissions();

  const isMember =
    isSuperAdmin ||
    organizationMemberships.some((m) => m.organization.id === LEMTEL_ORG_ID);

  const isAdmin =
    isSuperAdmin ||
    (selectedOrgId === LEMTEL_ORG_ID && (role === 'super_admin' || role === 'org_admin' || role === 'manager')) ||
    organizationMemberships.some(
      (m) => m.organization.id === LEMTEL_ORG_ID && (role === 'super_admin' || role === 'org_admin' || role === 'manager')
    );

  const isLemtelOrgSelected = selectedOrgId === LEMTEL_ORG_ID;

  return { isMember, isAdmin, isLemtelOrgSelected, isSuperAdmin };
}
