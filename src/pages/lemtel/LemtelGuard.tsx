import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useLemtelAccess } from '@/hooks/useLemtelAccess';
import { useOrganization } from '@/context/OrganizationContext';
import { AppLayout } from '@/components/layout/AppLayout';

/**
 * Guards Lemtel/telephony routes. AVA-only users (not a Lemtel member and
 * not a super admin) are redirected to /dashboard so they never see
 * phone-system pages or data.
 */
export function LemtelGuard({ children }: { children: ReactNode }) {
  const { isMember, isLemtelOrgSelected } = useLemtelAccess();
  const { isLoading } = useOrganization();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!isMember || !isLemtelOrgSelected) {
    return <Navigate to="/dashboard" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}
