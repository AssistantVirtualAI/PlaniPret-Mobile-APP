import { useState, useEffect } from 'react';
import { DollarSign, Phone, MessageSquare, Clock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTwilioIntegration, TwilioUsageRecord } from '@/hooks/useTwilioIntegration';
import { useTranslation } from '@/hooks/useTranslation';
import { format, subDays } from 'date-fns';

export function TwilioUsageTab() {
  const { t } = useTranslation();
  const { getUsage, getAccount } = useTwilioIntegration();
  
  const [usage, setUsage] = useState<TwilioUsageRecord[]>([]);
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      
      const [usageData, accountData] = await Promise.all([
        getUsage.mutateAsync({ startDate, endDate }),
        getAccount.mutateAsync(),
      ]);
      
      setUsage(usageData);
      setAccount(accountData);
    } catch (error) {
      console.error('Error fetching Twilio data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const totalCost = usage.reduce((sum, r) => sum + r.price, 0);
  const callsCount = usage.find(r => r.category === 'calls')?.count || 0;
  const smsCount = usage.find(r => r.category === 'sms')?.count || 0;
  const callMinutes = usage.find(r => r.category === 'calls')?.usage || 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('twilio.usage.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('twilio.usage.description')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Account Info */}
      {account && (
        <Card>
          <CardHeader>
            <CardTitle>{t('twilio.usage.accountInfo')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.usage.accountName')}</p>
                <p className="font-medium">{account.friendly_name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.usage.accountStatus')}</p>
                <p className="font-medium capitalize">{account.status}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.usage.accountType')}</p>
                <p className="font-medium capitalize">{account.type}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('twilio.usage.accountSid')}</p>
                <p className="font-mono text-sm">{account.sid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('twilio.usage.totalCost')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              <span className="text-2xl font-bold">${totalCost.toFixed(2)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('twilio.usage.last30Days')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('twilio.usage.totalCalls')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Phone className="w-5 h-5 text-blue-500" />
              <span className="text-2xl font-bold">{callsCount}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('twilio.usage.last30Days')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('twilio.usage.totalSms')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-purple-500" />
              <span className="text-2xl font-bold">{smsCount}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('twilio.usage.last30Days')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('twilio.usage.callMinutes')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-orange-500" />
              <span className="text-2xl font-bold">{callMinutes.toFixed(0)}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{t('twilio.usage.last30Days')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Usage */}
      <Card>
        <CardHeader>
          <CardTitle>{t('twilio.usage.detailedUsage')}</CardTitle>
          <CardDescription>{t('twilio.usage.detailedDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('twilio.usage.noUsage')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('twilio.usage.category')}</TableHead>
                  <TableHead>{t('twilio.usage.usageDesc')}</TableHead>
                  <TableHead className="text-right">{t('twilio.usage.count')}</TableHead>
                  <TableHead className="text-right">{t('twilio.usage.usageAmount')}</TableHead>
                  <TableHead className="text-right">{t('twilio.usage.cost')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.filter(r => r.price > 0).map((record, index) => (
                  <TableRow key={index}>
                    <TableCell className="capitalize">{record.category.replace(/-/g, ' ')}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{record.description}</TableCell>
                    <TableCell className="text-right">{record.count} {record.count_unit}</TableCell>
                    <TableCell className="text-right">{record.usage.toFixed(2)} {record.usage_unit}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${record.price.toFixed(4)} {record.price_unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
