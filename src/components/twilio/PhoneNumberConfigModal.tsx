import { useState, useEffect } from 'react';
import { Loader2, Bot, Phone, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTwilioIntegration, TwilioPhoneNumber, TwilioTwiMLApp } from '@/hooks/useTwilioIntegration';
import { useAgentsForTwilio } from '@/hooks/useAgentsForTwilio';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phoneNumber: TwilioPhoneNumber;
  twimlApps: TwilioTwiMLApp[];
}

export function PhoneNumberConfigModal({ open, onOpenChange, phoneNumber, twimlApps }: Props) {
  const { t } = useTranslation();
  const { updateNumber } = useTwilioIntegration();
  const { agents, assignTwilioNumber, getAgentByTwilioNumber } = useAgentsForTwilio();

  const [friendlyName, setFriendlyName] = useState(phoneNumber.friendly_name);
  const [voiceUrl, setVoiceUrl] = useState(phoneNumber.voice_url || '');
  const [voiceMethod, setVoiceMethod] = useState(phoneNumber.voice_method);
  const [voiceFallbackUrl, setVoiceFallbackUrl] = useState(phoneNumber.voice_fallback_url || '');
  const [voiceFallbackMethod, setVoiceFallbackMethod] = useState(phoneNumber.voice_fallback_method);
  const [statusCallback, setStatusCallback] = useState(phoneNumber.status_callback || '');
  const [statusCallbackMethod, setStatusCallbackMethod] = useState(phoneNumber.status_callback_method);
  const [smsUrl, setSmsUrl] = useState(phoneNumber.sms_url || '');
  const [smsMethod, setSmsMethod] = useState(phoneNumber.sms_method);
  const [smsFallbackUrl, setSmsFallbackUrl] = useState(phoneNumber.sms_fallback_url || '');
  const [smsFallbackMethod, setSmsFallbackMethod] = useState(phoneNumber.sms_fallback_method);
  const [voiceApplicationSid, setVoiceApplicationSid] = useState(phoneNumber.voice_application_sid || '');
  const [smsApplicationSid, setSmsApplicationSid] = useState(phoneNumber.sms_application_sid || '');
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  
  // Agent assignment
  const currentAgent = getAgentByTwilioNumber(phoneNumber.phone_number);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(currentAgent?.id || '');

  useEffect(() => {
    const agent = getAgentByTwilioNumber(phoneNumber.phone_number);
    setSelectedAgentId(agent?.id || '');
  }, [phoneNumber.phone_number, agents]);

  useEffect(() => {
    setFriendlyName(phoneNumber.friendly_name);
    setVoiceUrl(phoneNumber.voice_url || '');
    setVoiceMethod(phoneNumber.voice_method);
    setVoiceFallbackUrl(phoneNumber.voice_fallback_url || '');
    setVoiceFallbackMethod(phoneNumber.voice_fallback_method);
    setStatusCallback(phoneNumber.status_callback || '');
    setStatusCallbackMethod(phoneNumber.status_callback_method);
    setSmsUrl(phoneNumber.sms_url || '');
    setSmsMethod(phoneNumber.sms_method);
    setSmsFallbackUrl(phoneNumber.sms_fallback_url || '');
    setSmsFallbackMethod(phoneNumber.sms_fallback_method);
    setVoiceApplicationSid(phoneNumber.voice_application_sid || '');
    setSmsApplicationSid(phoneNumber.sms_application_sid || '');
  }, [phoneNumber]);

  const handleSave = async () => {
    await updateNumber.mutateAsync({
      phoneSid: phoneNumber.sid,
      friendly_name: friendlyName,
      voice_url: voiceApplicationSid ? undefined : voiceUrl,
      voice_method: voiceMethod,
      voice_fallback_url: voiceApplicationSid ? undefined : voiceFallbackUrl,
      voice_fallback_method: voiceFallbackMethod,
      status_callback: statusCallback,
      status_callback_method: statusCallbackMethod,
      sms_url: smsApplicationSid ? undefined : smsUrl,
      sms_method: smsMethod,
      sms_fallback_url: smsApplicationSid ? undefined : smsFallbackUrl,
      sms_fallback_method: smsFallbackMethod,
      voice_application_sid: voiceApplicationSid || undefined,
      sms_application_sid: smsApplicationSid || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('twilio.phoneNumbers.configureNumber')} {phoneNumber.phone_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('twilio.phoneNumbers.friendlyName')}</Label>
            <Input
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
              placeholder="Mon numéro principal"
            />
          </div>

          {/* Agent Assignment Section */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="w-4 h-4" />
                {t('twilio.phoneNumbers.agentAssignment')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('twilio.phoneNumbers.agentAssignmentDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select 
                value={selectedAgentId} 
                onValueChange={async (value) => {
                  setSelectedAgentId(value);
                  await assignTwilioNumber.mutateAsync({
                    agentId: value || null,
                    twilioNumber: phoneNumber.phone_number,
                  });
                  
                  // Auto-configure voice webhook and status callback when agent is assigned
                  if (value) {
                    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                    const voiceWebhookUrl = `${supabaseUrl}/functions/v1/twilio-voice-webhook`;
                    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-status-callback`;
                    
                    await updateNumber.mutateAsync({
                      phoneSid: phoneNumber.sid,
                      voice_url: voiceWebhookUrl,
                      voice_method: 'POST',
                      status_callback: statusCallbackUrl,
                      status_callback_method: 'POST',
                    });
                    
                    setVoiceUrl(voiceWebhookUrl);
                    setStatusCallback(statusCallbackUrl);
                  }
                  
                  toast.success(value ? t('twilio.phoneNumbers.agentAssigned') : t('twilio.phoneNumbers.agentUnassigned'));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('twilio.phoneNumbers.selectAgent')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('twilio.phoneNumbers.noAgent')}</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <span>{agent.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {agent.platform}
                        </Badge>
                        {agent.twilio_number && agent.twilio_number !== phoneNumber.phone_number && (
                          <Badge variant="secondary" className="text-xs">
                            <Phone className="w-3 h-3 mr-1" />
                            {agent.twilio_number}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAgentId && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t('twilio.phoneNumbers.agentAssignmentNote')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recording Toggle */}
          <Card className="border-muted">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mic className="w-4 h-4" />
                {t('twilio.recording.enabled')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('twilio.recording.enabledDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Label htmlFor="recording-toggle" className="cursor-pointer">
                  {t('twilio.recording.toggle')}
                </Label>
                <Switch
                  id="recording-toggle"
                  checked={recordingEnabled}
                  onCheckedChange={setRecordingEnabled}
                />
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="voice">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="voice">{t('twilio.phoneNumbers.voiceSettings')}</TabsTrigger>
              <TabsTrigger value="sms">{t('twilio.phoneNumbers.smsSettings')}</TabsTrigger>
            </TabsList>

            <TabsContent value="voice" className="space-y-4 mt-4">
              <div>
                <Label>{t('twilio.phoneNumbers.voiceApp')}</Label>
                <Select value={voiceApplicationSid} onValueChange={setVoiceApplicationSid}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('twilio.phoneNumbers.selectApp')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('twilio.phoneNumbers.noApp')}</SelectItem>
                    {twimlApps.map((app) => (
                      <SelectItem key={app.sid} value={app.sid}>
                        {app.friendly_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!voiceApplicationSid && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label>{t('twilio.phoneNumbers.voiceUrl')}</Label>
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
                      <Label>{t('twilio.phoneNumbers.voiceFallbackUrl')}</Label>
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
                </>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Label>{t('twilio.phoneNumbers.statusCallback')}</Label>
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
              <div>
                <Label>{t('twilio.phoneNumbers.smsApp')}</Label>
                <Select value={smsApplicationSid} onValueChange={setSmsApplicationSid}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('twilio.phoneNumbers.selectApp')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">{t('twilio.phoneNumbers.noApp')}</SelectItem>
                    {twimlApps.map((app) => (
                      <SelectItem key={app.sid} value={app.sid}>
                        {app.friendly_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!smsApplicationSid && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label>{t('twilio.phoneNumbers.smsWebhookUrl')}</Label>
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
                      <Label>{t('twilio.phoneNumbers.smsFallbackUrl')}</Label>
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
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={updateNumber.isPending}>
            {updateNumber.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
