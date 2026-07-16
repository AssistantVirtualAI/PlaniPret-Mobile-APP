import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTwilioIntegration, TwilioTwiMLApp } from '@/hooks/useTwilioIntegration';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: TwilioTwiMLApp | null;
}

export function TwiMLAppModal({ open, onOpenChange, app }: Props) {
  const { t } = useTranslation();
  const { createTwiMLApp, updateTwiMLApp } = useTwilioIntegration();
  const isEdit = !!app;

  const [friendlyName, setFriendlyName] = useState('');
  const [voiceUrl, setVoiceUrl] = useState('');
  const [voiceMethod, setVoiceMethod] = useState('POST');
  const [voiceFallbackUrl, setVoiceFallbackUrl] = useState('');
  const [voiceFallbackMethod, setVoiceFallbackMethod] = useState('POST');
  const [statusCallback, setStatusCallback] = useState('');
  const [statusCallbackMethod, setStatusCallbackMethod] = useState('POST');
  const [smsUrl, setSmsUrl] = useState('');
  const [smsMethod, setSmsMethod] = useState('POST');
  const [smsFallbackUrl, setSmsFallbackUrl] = useState('');
  const [smsFallbackMethod, setSmsFallbackMethod] = useState('POST');
  const [smsStatusCallback, setSmsStatusCallback] = useState('');

  useEffect(() => {
    if (app) {
      setFriendlyName(app.friendly_name);
      setVoiceUrl(app.voice_url || '');
      setVoiceMethod(app.voice_method);
      setVoiceFallbackUrl(app.voice_fallback_url || '');
      setVoiceFallbackMethod(app.voice_fallback_method);
      setStatusCallback(app.status_callback || '');
      setStatusCallbackMethod(app.status_callback_method);
      setSmsUrl(app.sms_url || '');
      setSmsMethod(app.sms_method);
      setSmsFallbackUrl(app.sms_fallback_url || '');
      setSmsFallbackMethod(app.sms_fallback_method);
      setSmsStatusCallback(app.sms_status_callback || '');
    } else {
      setFriendlyName('');
      setVoiceUrl('');
      setVoiceMethod('POST');
      setVoiceFallbackUrl('');
      setVoiceFallbackMethod('POST');
      setStatusCallback('');
      setStatusCallbackMethod('POST');
      setSmsUrl('');
      setSmsMethod('POST');
      setSmsFallbackUrl('');
      setSmsFallbackMethod('POST');
      setSmsStatusCallback('');
    }
  }, [app, open]);

  const handleSave = async () => {
    if (isEdit && app) {
      await updateTwiMLApp.mutateAsync({
        appSid: app.sid,
        friendly_name: friendlyName,
        voice_url: voiceUrl,
        voice_method: voiceMethod,
        voice_fallback_url: voiceFallbackUrl,
        voice_fallback_method: voiceFallbackMethod,
        status_callback: statusCallback,
        status_callback_method: statusCallbackMethod,
        sms_url: smsUrl,
        sms_method: smsMethod,
        sms_fallback_url: smsFallbackUrl,
        sms_fallback_method: smsFallbackMethod,
        sms_status_callback: smsStatusCallback,
      });
    } else {
      await createTwiMLApp.mutateAsync({
        friendly_name: friendlyName,
        voice_url: voiceUrl,
        voice_method: voiceMethod,
        voice_fallback_url: voiceFallbackUrl,
        voice_fallback_method: voiceFallbackMethod,
        status_callback: statusCallback,
        status_callback_method: statusCallbackMethod,
        sms_url: smsUrl,
        sms_method: smsMethod,
        sms_fallback_url: smsFallbackUrl,
        sms_fallback_method: smsFallbackMethod,
        sms_status_callback: smsStatusCallback,
      });
    }
    onOpenChange(false);
  };

  const isPending = createTwiMLApp.isPending || updateTwiMLApp.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('twilio.apps.editTitle') : t('twilio.apps.createTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('twilio.apps.appName')} *</Label>
            <Input
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="Mon Application TwiML"
            />
          </div>

          <Tabs defaultValue="voice">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="voice">{t('twilio.apps.voiceSettings')}</TabsTrigger>
              <TabsTrigger value="sms">{t('twilio.apps.smsSettings')}</TabsTrigger>
            </TabsList>

            <TabsContent value="voice" className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>{t('twilio.apps.voiceRequestUrl')}</Label>
                  <Input
                    value={voiceUrl}
                    onChange={(e) => setVoiceUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label>{t('twilio.phoneNumbers.method')}</Label>
                  <Select value={voiceMethod} onValueChange={setVoiceMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>{t('twilio.apps.voiceFallbackUrl')}</Label>
                  <Input
                    value={voiceFallbackUrl}
                    onChange={(e) => setVoiceFallbackUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label>{t('twilio.phoneNumbers.method')}</Label>
                  <Select value={voiceFallbackMethod} onValueChange={setVoiceFallbackMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>{t('twilio.apps.statusCallback')}</Label>
                  <Input
                    value={statusCallback}
                    onChange={(e) => setStatusCallback(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label>{t('twilio.phoneNumbers.method')}</Label>
                  <Select value={statusCallbackMethod} onValueChange={setStatusCallbackMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="sms" className="space-y-4 mt-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>{t('twilio.apps.smsRequestUrl')}</Label>
                  <Input
                    value={smsUrl}
                    onChange={(e) => setSmsUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label>{t('twilio.phoneNumbers.method')}</Label>
                  <Select value={smsMethod} onValueChange={setSmsMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>{t('twilio.apps.smsFallbackUrl')}</Label>
                  <Input
                    value={smsFallbackUrl}
                    onChange={(e) => setSmsFallbackUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <Label>{t('twilio.phoneNumbers.method')}</Label>
                  <Select value={smsFallbackMethod} onValueChange={setSmsFallbackMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>{t('twilio.apps.smsStatusCallback')}</Label>
                <Input
                  value={smsStatusCallback}
                  onChange={(e) => setSmsStatusCallback(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isPending || !friendlyName}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? t('common.save') : t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
