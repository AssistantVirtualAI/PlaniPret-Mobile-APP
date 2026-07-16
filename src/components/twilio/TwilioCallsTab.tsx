import { useState, useRef } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, Loader2, RefreshCw, Bot, Play, Pause, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTwilioIntegration, TwilioCall } from '@/hooks/useTwilioIntegration';
import { useAgentsForTwilio } from '@/hooks/useAgentsForTwilio';
import { useTranslation } from '@/hooks/useTranslation';
import { useOrganization } from '@/context/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ActiveCallsPanel } from './ActiveCallsPanel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';

function normalizePhoneNumber(phone: string): string {
  return phone?.replace(/[\s\-\(\)]/g, '') || '';
}

export function TwilioCallsTab() {
  const { t } = useTranslation();
  const { getCalls } = useTwilioIntegration();
  const { agents } = useAgentsForTwilio();
  const { selectedOrgId } = useOrganization();
  const [calls, setCalls] = useState<TwilioCall[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [playingCallSid, setPlayingCallSid] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadCalls = async () => {
    setLoading(true);
    try {
      const result = await getCalls.mutateAsync({});
      setCalls(result);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const getAssignedAgent = (call: TwilioCall) => {
    const phoneNumber = call.direction === 'inbound' ? call.to : call.from;
    const normalizedNumber = normalizePhoneNumber(phoneNumber);
    
    const agent = agents.find(a => {
      if (!a.twilio_number) return false;
      const normalizedAgentNumber = normalizePhoneNumber(a.twilio_number);
      return normalizedAgentNumber === normalizedNumber || a.twilio_number === phoneNumber;
    });
    
    return agent;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}${t('twilio.calls.seconds')}`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      'in-progress': 'secondary',
      busy: 'outline',
      failed: 'destructive',
      'no-answer': 'outline',
      canceled: 'outline',
      queued: 'secondary',
      ringing: 'secondary',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const playRecording = async (callSid: string) => {
    if (playingCallSid === callSid) {
      // Stop playing
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingCallSid(null);
      return;
    }

    try {
      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to listen to recordings');
        return;
      }

      // Create audio URL via edge function proxy
      const response = await supabase.functions.invoke('twilio-recording-proxy', {
        body: { callSid, organizationId: selectedOrgId },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Create blob URL from response
      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
      }

      // Play new audio
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      setPlayingCallSid(callSid);

      audio.onended = () => {
        setPlayingCallSid(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = () => {
        toast.error('Failed to play recording');
        setPlayingCallSid(null);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing recording:', error);
      toast.error('Failed to load recording');
      setPlayingCallSid(null);
    }
  };

  // Check if a call has a recording (for now we'll check by status - completed calls may have recordings)
  const hasRecording = (call: TwilioCall) => {
    return call.status === 'completed' && call.duration > 0;
  };

  return (
    <div className="space-y-6">
      {/* Active Calls Panel - Real-time */}
      <ActiveCallsPanel />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('twilio.calls.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('twilio.calls.description')}</p>
        </div>
        <Button 
          onClick={loadCalls} 
          disabled={loading}
          variant={loaded ? 'outline' : 'default'}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {loaded ? t('twilio.calls.refresh') : t('twilio.calls.loadCalls')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            {t('twilio.calls.title')}
          </CardTitle>
          <CardDescription>
            {loaded ? `${calls.length} ${t('twilio.calls.callsFound')}` : t('twilio.calls.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!loaded ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('twilio.calls.noCallsDescription')}</p>
              <Button variant="link" onClick={loadCalls} disabled={loading}>
                {t('twilio.calls.loadCalls')}
              </Button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : calls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t('twilio.calls.noCallsFound')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('twilio.calls.direction')}</TableHead>
                  <TableHead>{t('twilio.calls.from')}</TableHead>
                  <TableHead>{t('twilio.calls.to')}</TableHead>
                  <TableHead>{t('twilio.calls.agent')}</TableHead>
                  <TableHead>{t('twilio.calls.status')}</TableHead>
                  <TableHead>{t('twilio.calls.duration')}</TableHead>
                  <TableHead>{t('twilio.calls.recording')}</TableHead>
                  <TableHead>{t('twilio.calls.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calls.map((call) => {
                  const assignedAgent = getAssignedAgent(call);
                  const isPlaying = playingCallSid === call.sid;
                  return (
                    <TableRow key={call.sid}>
                      <TableCell>
                        {call.direction === 'inbound' ? (
                          <Badge variant="secondary" className="gap-1">
                            <PhoneIncoming className="w-3 h-3" />
                            {t('twilio.calls.inbound')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <PhoneOutgoing className="w-3 h-3" />
                            {t('twilio.calls.outbound')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{call.from}</TableCell>
                      <TableCell className="font-mono text-sm">{call.to}</TableCell>
                      <TableCell>
                        {assignedAgent ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="default" className="gap-1 cursor-pointer">
                                  <Bot className="w-3 h-3" />
                                  {assignedAgent.name}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{assignedAgent.platform}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t('twilio.calls.noAgent')}</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(call.status)}</TableCell>
                      <TableCell>{formatDuration(call.duration)}</TableCell>
                      <TableCell>
                        {hasRecording(call) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => playRecording(call.sid)}
                            className="gap-1"
                          >
                            {isPlaying ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                            {isPlaying ? t('twilio.calls.listen') : t('twilio.calls.playRecording')}
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t('twilio.calls.noRecording')}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(call.date_created), 'dd MMM yyyy HH:mm', { locale: fr })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
