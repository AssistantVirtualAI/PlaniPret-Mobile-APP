import { Button } from '@/components/ui/button';
import { Bot, Plus, Sparkles, Mail } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useOrganization } from '@/context/OrganizationContext';

interface EmptyStateProps {
  onCreateAgent: () => void;
  onCreateWithBuilder?: () => void;
}

export function EmptyState({ onCreateAgent, onCreateWithBuilder }: EmptyStateProps) {
  const { t } = useTranslation();
  const { selectedOrg } = useOrganization();

  const orgName = selectedOrg?.name || 'your organization';

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-muted p-6 mb-4">
        <Bot className="w-16 h-16 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-semibold mb-2">
        No agents for {orgName}
      </h3>
      <p className="text-muted-foreground mb-6 max-w-md">
        You're only seeing agents that belong to <strong>{orgName}</strong>.
        Create a new agent below, or request access if you believe agents are missing.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button onClick={onCreateAgent} size="lg" variant="outline">
          <Plus className="mr-2 h-5 w-5" />
          {t('agents.viaIntegration')}
        </Button>
        {onCreateWithBuilder && (
          <Button onClick={onCreateWithBuilder} size="lg">
            <Sparkles className="mr-2 h-5 w-5" />
            {t('agents.createWithBuilder')}
          </Button>
        )}
        <Button
          size="lg"
          variant="ghost"
          onClick={() => {
            window.location.href = `mailto:support@avastatistic.com?subject=Agent access request for ${encodeURIComponent(orgName)}&body=${encodeURIComponent(
              `Hello,\n\nI am a member of ${orgName} and I expected to see agents that are not currently visible.\nPlease grant access or investigate.\n\nThanks.`
            )}`;
          }}
        >
          <Mail className="mr-2 h-5 w-5" />
          Request access
        </Button>
      </div>
    </div>
  );
}
