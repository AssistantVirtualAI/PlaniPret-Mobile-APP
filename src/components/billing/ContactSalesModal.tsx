import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Send, CheckCircle } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ContactSalesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactSalesModal({ open, onOpenChange }: ContactSalesModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    expectedClients: '',
    currentPlatform: '',
    requirements: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email) {
      toast.error(t('messages.requiredFields'));
      return;
    }

    setIsSubmitting(true);
    
    try {
      const { error } = await supabase.functions.invoke('send-contact-sales', {
        body: formData,
      });

      if (error) throw error;

      setIsSuccess(true);
      toast.success(t('billing.contactSales.successMessage'));
      
      // Reset and close after delay
      setTimeout(() => {
        setIsSuccess(false);
        setFormData({
          name: '',
          email: '',
          company: '',
          phone: '',
          expectedClients: '',
          currentPlatform: '',
          requirements: '',
        });
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error('Error sending contact form:', error);
      toast.error(t('billing.contactSales.errorMessage'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-10">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {t('billing.contactSales.successTitle')}
            </h3>
            <p className="text-muted-foreground text-center">
              {t('billing.contactSales.successDescription')}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('billing.contactSales.title')}</DialogTitle>
          <DialogDescription>
            {t('billing.contactSales.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('billing.contactSales.name')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('billing.contactSales.namePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('billing.contactSales.email')} *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder={t('billing.contactSales.emailPlaceholder')}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">{t('billing.contactSales.company')}</Label>
              <Input
                id="company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                placeholder={t('billing.contactSales.companyPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('billing.contactSales.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder={t('billing.contactSales.phonePlaceholder')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expectedClients">{t('billing.contactSales.expectedClients')}</Label>
              <Select
                value={formData.expectedClients}
                onValueChange={(value) => setFormData({ ...formData, expectedClients: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('billing.contactSales.selectOption')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10</SelectItem>
                  <SelectItem value="11-50">11-50</SelectItem>
                  <SelectItem value="51-100">51-100</SelectItem>
                  <SelectItem value="100+">100+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentPlatform">{t('billing.contactSales.currentPlatform')}</Label>
              <Select
                value={formData.currentPlatform}
                onValueChange={(value) => setFormData({ ...formData, currentPlatform: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('billing.contactSales.selectOption')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="vapi">Vapi</SelectItem>
                  <SelectItem value="retell">Retell</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="none">None / New to AI Voice</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements">{t('billing.contactSales.requirements')}</Label>
            <Textarea
              id="requirements"
              value={formData.requirements}
              onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
              placeholder={t('billing.contactSales.requirementsPlaceholder')}
              rows={4}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('billing.contactSales.sending')}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {t('billing.contactSales.submit')}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
