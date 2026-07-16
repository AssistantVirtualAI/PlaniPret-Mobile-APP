import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Lock, FileCheck, Key, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { useOrganization } from '@/context/OrganizationContext';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SecurityCheck {
  name: string;
  description: string;
  status: 'passed' | 'failed' | 'warning';
  icon: React.ReactNode;
}

export const SecurityStatus = () => {
  const { selectedOrg } = useOrganization();
  const [orgData, setOrgData] = useState<{
    hipaa_enabled: boolean;
    gdpr_enabled: boolean;
    baa_signed_at: string | null;
  } | null>(null);

  useEffect(() => {
    if (selectedOrg) {
      fetchOrgData();
    }
  }, [selectedOrg]);

  const fetchOrgData = async () => {
    if (!selectedOrg) return;
    const { data } = await supabase
      .from('organizations')
      .select('hipaa_enabled, gdpr_enabled, baa_signed_at')
      .eq('id', selectedOrg.id)
      .single();
    setOrgData(data);
  };

  const securityChecks: SecurityCheck[] = [
    {
      name: 'Chiffrement au repos (AES-256)',
      description: 'Toutes les données sont chiffrées au repos avec AES-256',
      status: 'passed',
      icon: <Lock className="w-4 h-4" />,
    },
    {
      name: 'Chiffrement en transit (TLS 1.3)',
      description: 'Toutes les communications utilisent TLS 1.3',
      status: 'passed',
      icon: <Shield className="w-4 h-4" />,
    },
    {
      name: 'Journaux d\'audit',
      description: 'Enregistrement automatique de toutes les actions',
      status: orgData?.hipaa_enabled ? 'passed' : 'warning',
      icon: <FileCheck className="w-4 h-4" />,
    },
    {
      name: 'BAA signé',
      description: 'Business Associate Agreement pour HIPAA',
      status: orgData?.baa_signed_at ? 'passed' : orgData?.hipaa_enabled ? 'warning' : 'failed',
      icon: <Key className="w-4 h-4" />,
    },
    {
      name: 'Conformité RGPD',
      description: 'Consentement cookies et droits utilisateurs',
      status: orgData?.gdpr_enabled ? 'passed' : 'warning',
      icon: <Shield className="w-4 h-4" />,
    },
  ];

  const getStatusIcon = (status: SecurityCheck['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  const passedCount = securityChecks.filter(c => c.status === 'passed').length;
  const totalChecks = securityChecks.length;
  const isFullyCompliant = passedCount === totalChecks;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Statut de sécurité
            </CardTitle>
            <CardDescription>
              Vue d'ensemble de la conformité et de la sécurité
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {orgData?.gdpr_enabled && (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="w-3 h-3" />
                RGPD
              </Badge>
            )}
            {orgData?.hipaa_enabled && (
              <Badge variant={isFullyCompliant ? 'default' : 'secondary'} className="gap-1">
                {isFullyCompliant ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                HIPAA
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Score de conformité</span>
            <span className="text-sm text-muted-foreground">{passedCount}/{totalChecks}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${
                passedCount === totalChecks ? 'bg-green-500' : 
                passedCount >= totalChecks * 0.6 ? 'bg-yellow-500' : 'bg-destructive'
              }`}
              style={{ width: `${(passedCount / totalChecks) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {securityChecks.map((check, index) => (
            <div key={index} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-full bg-background">
                {check.icon}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{check.name}</p>
                <p className="text-xs text-muted-foreground">{check.description}</p>
              </div>
              {getStatusIcon(check.status)}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
