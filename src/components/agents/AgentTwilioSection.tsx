import { useState } from 'react';
import { Phone, Plus, Search, Trash2, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTwilioIntegration, AvailableNumber } from '@/hooks/useTwilioIntegration';
import { useAgentsForTwilio } from '@/hooks/useAgentsForTwilio';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AgentTwilioSectionProps {
  agentId: string;
  agentName: string;
  currentTwilioNumber: string | null;
  organizationId: string;
}

export function AgentTwilioSection({ 
  agentId, 
  agentName, 
  currentTwilioNumber,
  organizationId 
}: AgentTwilioSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { 
    isConfigured,
    phoneNumbers, 
    searchNumbers, 
    purchaseNumber 
  } = useTwilioIntegration();
  const { assignTwilioNumber, refetchAgents } = useAgentsForTwilio();

  const [showModal, setShowModal] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [selectedExisting, setSelectedExisting] = useState<string>('');
  const [searchMode, setSearchMode] = useState(false);
  const [searchCountry, setSearchCountry] = useState('US');
  const [searchAreaCode, setSearchAreaCode] = useState('');
  const [searchResults, setSearchResults] = useState<AvailableNumber[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);

  // Get available numbers (not assigned to any agent)
  const availableNumbers = phoneNumbers.filter(n => {
    // Check if this number is assigned to another agent
    const isAssignedToAnother = !currentTwilioNumber || n.phone_number !== currentTwilioNumber;
    return isAssignedToAnother;
  });

  const handleSearch = async () => {
    const results = await searchNumbers.mutateAsync({
      country: searchCountry,
      areaCode: searchAreaCode || undefined,
      type: 'Local',
    });
    setSearchResults(results);
  };

  const handlePurchaseAndAssign = async (number: AvailableNumber) => {
    setIsAssigning(true);
    try {
      // Purchase the number
      await purchaseNumber.mutateAsync({
        phoneNumber: number.phone_number,
        friendlyName: `${agentName} - ${number.locality}`,
      });

      // Assign to agent
      await assignTwilioNumber.mutateAsync({
        agentId,
        twilioNumber: number.phone_number,
      });

      toast.success(t('twilio.agentSection.numberAssigned'));
      setShowModal(false);
      setSearchResults([]);
      refetchAgents();
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleAssignExisting = async () => {
    if (!selectedExisting) return;
    
    setIsAssigning(true);
    try {
      await assignTwilioNumber.mutateAsync({
        agentId,
        twilioNumber: selectedExisting,
      });

      toast.success(t('twilio.agentSection.numberAssigned'));
      setShowModal(false);
      setSelectedExisting('');
      refetchAgents();
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveNumber = async () => {
    setIsAssigning(true);
    try {
      // Just unassign the number from the agent
      const { error } = await supabase
        .from('agents')
        .update({ twilio_number: null })
        .eq('id', agentId);

      if (error) throw error;

      toast.success(t('twilio.agentSection.numberRemoved'));
      setShowRemoveConfirm(false);
      refetchAgents();
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsAssigning(false);
    }
  };

  if (!isConfigured) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            {t('twilio.agentSection.title')}
          </CardTitle>
          <CardDescription>
            {t('twilio.notConfiguredDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <a href="/integrations">
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('twilio.goToIntegrations')}
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            {t('twilio.agentSection.title')}
          </CardTitle>
          <CardDescription>
            {t('twilio.agentSection.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentTwilioNumber ? (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('twilio.agentSection.currentNumber')}</p>
                  <p className="font-mono font-semibold">{currentTwilioNumber}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowModal(true)}>
                  {t('twilio.agentSection.changeNumber')}
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowRemoveConfirm(true)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 border rounded-lg border-dashed">
              <Phone className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-4">{t('twilio.agentSection.noNumber')}</p>
              <Button onClick={() => setShowModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('twilio.agentSection.searchNumber')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign/Purchase Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('twilio.agentSection.title')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Select existing number */}
            {phoneNumbers.length > 0 && !searchMode && (
              <div className="space-y-4">
                <div>
                  <Label>{t('twilio.agentSection.selectExisting')}</Label>
                  <Select value={selectedExisting} onValueChange={setSelectedExisting}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('twilio.phoneNumbers.selectAgent')} />
                    </SelectTrigger>
                    <SelectContent>
                      {phoneNumbers.map((num) => (
                        <SelectItem key={num.sid} value={num.phone_number}>
                          {num.phone_number} {num.friendly_name && `(${num.friendly_name})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {selectedExisting && (
                  <Button 
                    onClick={handleAssignExisting} 
                    disabled={isAssigning}
                    className="w-full"
                  >
                    {isAssigning ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Phone className="w-4 h-4 mr-2" />
                    )}
                    {t('twilio.agentSection.purchaseAndAssign')}
                  </Button>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      {t('twilio.agentSection.orPurchase')}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Search for new number */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('twilio.phoneNumbers.country')}</Label>
                  <Select value={searchCountry} onValueChange={setSearchCountry}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">États-Unis (+1)</SelectItem>
                      <SelectItem value="CA">Canada (+1)</SelectItem>
                      <SelectItem value="FR">France (+33)</SelectItem>
                      <SelectItem value="GB">Royaume-Uni (+44)</SelectItem>
                      <SelectItem value="DE">Allemagne (+49)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('twilio.phoneNumbers.areaCode')}</Label>
                  <Input
                    value={searchAreaCode}
                    onChange={(e) => setSearchAreaCode(e.target.value)}
                    placeholder="415"
                  />
                </div>
              </div>
              
              <Button 
                onClick={handleSearch} 
                disabled={searchNumbers.isPending}
                variant="outline"
                className="w-full"
              >
                {searchNumbers.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                {t('twilio.phoneNumbers.search')}
              </Button>

              {searchResults.length > 0 && (
                <div className="max-h-[250px] overflow-y-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('twilio.phoneNumbers.number')}</TableHead>
                        <TableHead>{t('twilio.phoneNumbers.location')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResults.map((number) => (
                        <TableRow key={number.phone_number}>
                          <TableCell className="font-mono">{number.phone_number}</TableCell>
                          <TableCell>{number.locality}, {number.region}</TableCell>
                          <TableCell>
                            <Button 
                              size="sm" 
                              onClick={() => handlePurchaseAndAssign(number)}
                              disabled={isAssigning}
                            >
                              {isAssigning ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                t('twilio.agentSection.purchaseAndAssign')
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Confirmation */}
      <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('twilio.agentSection.removeNumber')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('twilio.phoneNumbers.agentUnassigned')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRemoveNumber}
              disabled={isAssigning}
            >
              {isAssigning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('twilio.agentSection.removeNumber')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
