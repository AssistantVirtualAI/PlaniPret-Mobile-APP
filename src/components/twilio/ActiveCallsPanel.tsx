import { useState, useEffect, useCallback } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneOff, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/context/OrganizationContext';
import { useTranslation } from '@/hooks/useTranslation';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ActiveCall {
  id: string;
  call_sid: string;
  from_number: string;
  to_number: string;
  direction: string;
  status: string;
  agent_id: string | null;
  started_at: string;
  duration: number | null;
}

interface AgentInfo {
  id: string;
  name: string;
}

export function ActiveCallsPanel() {
  const { t } = useTranslation();
  const { selectedOrgId } = useOrganization();
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [agents, setAgents] = useState<Record<string, AgentInfo>>({});
  const [loading, setLoading] = useState(true);
  const [timers, setTimers] = useState<Record<string, number>>({});

  // Format duration as mm:ss
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Fetch agents for display
  const fetchAgents = useCallback(async () => {
    if (!selectedOrgId) return;
    
    const { data } = await supabase
      .from('agents_safe')
      .select('id, name')
      .eq('organization_id', selectedOrgId);
    
    if (data) {
      const agentMap: Record<string, AgentInfo> = {};
      data.forEach(agent => {
        agentMap[agent.id] = agent;
      });
      setAgents(agentMap);
    }
  }, [selectedOrgId]);

  // Fetch active calls
  const fetchActiveCalls = useCallback(async () => {
    if (!selectedOrgId) return;

    const { data, error } = await supabase
      .from('twilio_active_calls')
      .select('*')
      .eq('organization_id', selectedOrgId)
      .in('status', ['initiated', 'ringing', 'in-progress', 'queued'])
      .order('started_at', { ascending: false });

    if (error) {
      console.error('Error fetching active calls:', error);
    } else {
      setActiveCalls(data || []);
      
      // Initialize timers for in-progress calls
      const newTimers: Record<string, number> = {};
      data?.forEach(call => {
        if (call.status === 'in-progress') {
          const startTime = new Date(call.started_at).getTime();
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          newTimers[call.call_sid] = elapsed;
        }
      });
      setTimers(newTimers);
    }
    setLoading(false);
  }, [selectedOrgId]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!selectedOrgId) return;

    fetchActiveCalls();
    fetchAgents();

    const channel = supabase
      .channel(`active-calls-${selectedOrgId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'twilio_active_calls',
          filter: `organization_id=eq.${selectedOrgId}`,
        },
        (payload) => {
          console.log('Realtime call update:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newCall = payload.new as ActiveCall;
            if (['initiated', 'ringing', 'in-progress', 'queued'].includes(newCall.status)) {
              setActiveCalls(prev => [newCall, ...prev.filter(c => c.call_sid !== newCall.call_sid)]);
              
              // Show toast for incoming calls
              const direction = newCall.direction === 'inbound' ? t('twilio.activeCalls.incoming') : t('twilio.activeCalls.outgoing');
              toast.info(`${direction}: ${newCall.from_number}`, {
                icon: <PhoneIncoming className="w-4 h-4" />,
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedCall = payload.new as ActiveCall;
            
            if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(updatedCall.status)) {
              // Remove from active calls
              setActiveCalls(prev => prev.filter(c => c.call_sid !== updatedCall.call_sid));
              setTimers(prev => {
                const newTimers = { ...prev };
                delete newTimers[updatedCall.call_sid];
                return newTimers;
              });
              
              // Show toast for completed calls
              const durationText = updatedCall.duration ? formatDuration(updatedCall.duration) : '';
              if (updatedCall.status === 'completed') {
                toast.success(`${t('twilio.notifications.callEnded')} ${durationText}`, {
                  icon: <PhoneOff className="w-4 h-4" />,
                });
              } else if (updatedCall.status === 'failed') {
                toast.error(t('twilio.notifications.callFailed'));
              }
            } else {
              // Update in list
              setActiveCalls(prev => 
                prev.map(c => c.call_sid === updatedCall.call_sid ? updatedCall : c)
              );
              
              // Start timer if call is now in-progress
              if (updatedCall.status === 'in-progress') {
                const startTime = new Date(updatedCall.started_at).getTime();
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                setTimers(prev => ({ ...prev, [updatedCall.call_sid]: elapsed }));
              }
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedCall = payload.old as ActiveCall;
            setActiveCalls(prev => prev.filter(c => c.call_sid !== deletedCall.call_sid));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedOrgId, fetchActiveCalls, fetchAgents, t]);

  // Update timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers(prev => {
        const updated: Record<string, number> = {};
        Object.entries(prev).forEach(([callSid, seconds]) => {
          updated[callSid] = seconds + 1;
        });
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ringing':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/30 animate-pulse">{t('twilio.activeCalls.ringing')}</Badge>;
      case 'in-progress':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">{t('twilio.activeCalls.inProgress')}</Badge>;
      case 'queued':
      case 'initiated':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30">{t('twilio.activeCalls.connecting')}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Phone className="w-4 h-4" />
            {t('twilio.activeCalls.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (activeCalls.length === 0) {
    return null; // Don't show panel when no active calls
  }

  return (
    <Card className="mb-4 border-green-500/30 bg-green-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Phone className="w-4 h-4 text-green-600 animate-pulse" />
          {t('twilio.activeCalls.title')}
          <Badge variant="secondary" className="ml-auto">{activeCalls.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {activeCalls.map((call) => (
          <div
            key={call.call_sid}
            className="flex items-center justify-between p-3 rounded-lg bg-background border"
          >
            <div className="flex items-center gap-3">
              {call.direction === 'inbound' ? (
                <PhoneIncoming className="w-5 h-5 text-green-600" />
              ) : (
                <PhoneOutgoing className="w-5 h-5 text-blue-600" />
              )}
              <div>
                <p className="font-medium text-sm">
                  {call.direction === 'inbound' ? call.from_number : call.to_number}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {call.agent_id && agents[call.agent_id] && (
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {agents[call.agent_id].name}
                    </span>
                  )}
                  <span>{format(new Date(call.started_at), 'HH:mm')}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {call.status === 'in-progress' && timers[call.call_sid] !== undefined && (
                <span className="font-mono text-sm text-green-600">
                  {formatDuration(timers[call.call_sid])}
                </span>
              )}
              {getStatusBadge(call.status)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
