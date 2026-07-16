import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  CreditCard, CheckCircle, XCircle, Play, Link2, 
  Receipt, Wallet, AlertCircle, ExternalLink, Calendar, TrendingUp
} from 'lucide-react';
import { useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useBillingConfig, ADDONS } from '@/hooks/useBillingConfig';
import { useStripeSubscription } from '@/hooks/useStripeSubscription';
import { PricingCards } from '@/components/billing/PricingCards';
import { SubscriptionStatus } from '@/components/billing/SubscriptionStatus';
import { PerformanceBillingTab } from '@/components/billing/PerformanceBillingTab';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface Invoice {
  id: string;
  amount_paid: number;
  currency: string;
  status: string;
  created: number;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

export default function StripeBilling() {
  const { t, language } = useTranslation();
  const [searchParams] = useSearchParams();
  const { selectedOrg } = useOrganization();
  const { billingConfig, currentPlan, isLoading } = useBillingConfig();
  const { createCheckoutSession, openCustomerPortal, refreshSubscription, isLoading: isActionLoading } = useStripeSubscription();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);

  const isStripeConnected = !!billingConfig?.stripe_customer_id;
  const dateLocale = language === 'fr' ? fr : enUS;

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success(t('messages.paymentSuccess'));
      refreshSubscription();
    } else if (searchParams.get('canceled') === 'true') {
      toast.info(t('messages.paymentCanceled'));
    }
  }, [searchParams]);

  useEffect(() => {
    if (isStripeConnected) {
      fetchInvoices();
      fetchPaymentMethods();
    }
  }, [isStripeConnected, billingConfig?.stripe_customer_id]);

  const fetchInvoices = async () => {
    if (!billingConfig?.stripe_customer_id) return;
    setLoadingInvoices(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-invoices', {
        body: { customerId: billingConfig.stripe_customer_id }
      });
      if (error) throw error;
      setInvoices(data?.invoices || []);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const fetchPaymentMethods = async () => {
    if (!billingConfig?.stripe_customer_id) return;
    setLoadingPaymentMethods(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-payment-methods', {
        body: { customerId: billingConfig.stripe_customer_id }
      });
      if (error) throw error;
      setPaymentMethods(data?.paymentMethods || []);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      setPaymentMethods([]);
    } finally {
      setLoadingPaymentMethods(false);
    }
  };

  const handleConnectStripe = async () => {
    await createCheckoutSession('starter');
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-2">
            {t('pages.billing.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('pages.billing.subtitle')}
          </p>
        </div>

        {searchParams.get('success') === 'true' && (
          <Alert className="mb-6 bg-green-500/10 border-green-500/50">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <AlertDescription className="text-green-500">
              {t('messages.paymentProcessed')}
            </AlertDescription>
          </Alert>
        )}

        {searchParams.get('canceled') === 'true' && (
          <Alert className="mb-6 bg-yellow-500/10 border-yellow-500/50">
            <XCircle className="w-4 h-4 text-yellow-500" />
            <AlertDescription className="text-yellow-500">
              {t('messages.paymentCanceled')}
            </AlertDescription>
          </Alert>
        )}

        {/* Connect to Stripe CTA */}
        {!isStripeConnected && !isLoading && (
          <Card className="mb-6 border-primary/50 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-primary/20">
                    <Link2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{t('pages.billing.connectStripe')}</h3>
                    <p className="text-muted-foreground text-sm">
                      {t('pages.billing.subscribeToActivate')}
                    </p>
                  </div>
                </div>
                <Button onClick={handleConnectStripe} disabled={isActionLoading}>
                  <CreditCard className="w-4 h-4 mr-2" />
                  {t('pages.billing.getStarted')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="subscription" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="subscription">{t('pages.billing.subscription')}</TabsTrigger>
            <TabsTrigger value="plans">{t('pages.billing.plans')}</TabsTrigger>
            <TabsTrigger value="performance">{t('pages.billing.performance')}</TabsTrigger>
            <TabsTrigger value="addons">{t('pages.billing.addons')}</TabsTrigger>
            <TabsTrigger value="history">{t('pages.billing.history')}</TabsTrigger>
            <TabsTrigger value="payment-methods">{t('pages.billing.paymentMethods')}</TabsTrigger>
            <TabsTrigger value="tutorial">{t('pages.billing.tutorial')}</TabsTrigger>
          </TabsList>

          <TabsContent value="subscription" className="space-y-6">
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <SubscriptionStatus
                billingConfig={billingConfig}
                currentPlanName={currentPlan.name}
                onManageSubscription={openCustomerPortal}
                isLoading={isActionLoading}
              />
            )}
          </TabsContent>

          <TabsContent value="performance" className="space-y-6">
            <PerformanceBillingTab />
          </TabsContent>

          <TabsContent value="plans" className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">{t('pages.billing.choosePlan')}</h2>
              <p className="text-muted-foreground">
                {t('pages.billing.selectPlanDescription')}
              </p>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-[400px]" />
                ))}
              </div>
            ) : (
              <PricingCards
                currentPlanId={billingConfig?.plan_tier || 'free'}
                onSelectPlan={createCheckoutSession}
                isLoading={isActionLoading}
              />
            )}
          </TabsContent>

          <TabsContent value="addons" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <CreditCard className="w-6 h-6 text-primary" />
                  <div>
                    <CardTitle>{t('pages.billing.availableAddons')}</CardTitle>
                    <CardDescription>
                      {t('pages.billing.addExtraFeatures')}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!isStripeConnected ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {t('pages.billing.subscribeForAddons')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ADDONS.map((addon) => {
                      const isAvailable = addon.availableFor.includes(billingConfig?.plan_tier || 'free');
                      return (
                        <Card key={addon.id} className={cn(
                          "relative",
                          !isAvailable && "opacity-60"
                        )}>
                          <CardHeader>
                            <CardTitle className="text-lg">{addon.name}</CardTitle>
                            <CardDescription>{addon.description}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-2xl font-bold">${addon.price}</span>
                                <span className="text-muted-foreground">/{language === 'fr' ? 'month' : 'month'}</span>
                              </div>
                              {isAvailable ? (
                                <Button 
                                  onClick={async () => {
                                    if (!selectedOrg?.id) return;
                                    try {
                                      const { data, error } = await supabase.functions.invoke('stripe-addon-checkout', {
                                        body: {
                                          organizationId: selectedOrg.id,
                                          addonId: addon.id,
                                          successUrl: `${window.location.origin}/billing?success=true&addon=${addon.id}`,
                                          cancelUrl: `${window.location.origin}/billing?canceled=true`,
                                        },
                                      });
                                      if (error) throw error;
                                      if (data?.url) window.location.href = data.url;
                                    } catch (err: any) {
                                      toast.error(err.message || t('messages.purchaseError'));
                                    }
                                  }}
                                  disabled={isActionLoading}
                                >
                                  {t('pages.billing.add')}
                                </Button>
                              ) : (
                                <Badge variant="secondary">
                                  {addon.availableFor.join(', ')} {t('pages.billing.onlyFor')}
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Receipt className="w-6 h-6 text-primary" />
                  <div>
                    <CardTitle>{t('pages.billing.paymentHistory')}</CardTitle>
                    <CardDescription>
                      {t('pages.billing.viewInvoices')}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!isStripeConnected ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {t('pages.billing.connectForHistory')}
                    </p>
                  </div>
                ) : loadingInvoices ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">{t('pages.billing.noInvoices')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoices.map((invoice) => (
                      <div 
                        key={invoice.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-muted rounded-lg">
                            <Receipt className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {formatCurrency(invoice.amount_paid, invoice.currency)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(invoice.created * 1000), 'dd MMMM yyyy', { locale: dateLocale })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={invoice.status === 'paid' ? 'default' : 'secondary'}>
                            {invoice.status === 'paid' ? t('pages.billing.paid') : invoice.status}
                          </Badge>
                          {invoice.hosted_invoice_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => window.open(invoice.hosted_invoice_url!, '_blank')}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {isStripeConnected && (
                  <div className="mt-4 pt-4 border-t">
                    <Button variant="outline" onClick={openCustomerPortal}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {t('pages.billing.viewAllInvoices')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payment-methods" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Wallet className="w-6 h-6 text-primary" />
                  <div>
                    <CardTitle>{t('pages.billing.paymentMethods')}</CardTitle>
                    <CardDescription>
                      {t('pages.billing.managePaymentMethods')}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {!isStripeConnected ? (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {t('pages.billing.connectForPaymentMethods')}
                    </p>
                  </div>
                ) : loadingPaymentMethods ? (
                  <div className="space-y-4">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : paymentMethods.length === 0 ? (
                  <div className="text-center py-8">
                    <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground mb-4">{t('pages.billing.noPaymentMethods')}</p>
                    <Button variant="outline" onClick={openCustomerPortal}>
                      {t('pages.billing.addPaymentMethod')}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {paymentMethods.map((method) => (
                      <div
                        key={method.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-muted rounded-lg">
                            <CreditCard className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-medium capitalize">
                              {method.brand} •••• {method.last4}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {t('pages.billing.expiresOn')} {method.exp_month}/{method.exp_year}
                            </p>
                          </div>
                        </div>
                        {method.is_default && (
                          <Badge>{t('pages.billing.defaultCard')}</Badge>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" className="w-full" onClick={openCustomerPortal}>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      {t('pages.billing.viewAllInvoices')}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tutorial" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Play className="w-6 h-6 text-primary" />
                  <div>
                    <CardTitle>{t('pages.billing.tutorial')}</CardTitle>
                    <CardDescription>
                      {language === 'fr' ? 'Apprenez à utiliser les fonctionnalités de facturation' : 'Learn how to use billing features'}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {language === 'fr' ? 'Tutoriel vidéo à venir' : 'Video tutorial coming soon'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}