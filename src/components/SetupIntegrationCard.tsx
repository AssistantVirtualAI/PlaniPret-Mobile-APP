import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Settings } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface SetupIntegrationCardProps {
  title: string;
  message?: string;
}

export const SetupIntegrationCard = ({ title, message }: SetupIntegrationCardProps) => {
  const { t } = useTranslation();
  return (
    <Card className="glass-card border-primary/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <AlertCircle className="h-8 w-8 text-primary" />
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>
              {message || t('setupIntegration.description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{t('setupIntegration.intro')}</p>
        <ul className="list-disc list-inside space-y-2 text-muted-foreground ml-4">
          <li>{t('setupIntegration.apiKey')}</li>
          <li>{t('setupIntegration.agentId')}</li>
        </ul>
        <Link to="/settings">
          <Button className="w-full" size="lg">
            <Settings className="mr-2 h-4 w-4" />
            {t('setupIntegration.cta')}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};
