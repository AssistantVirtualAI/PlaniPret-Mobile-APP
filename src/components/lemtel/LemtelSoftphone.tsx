import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, X, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLemtelAccess } from '@/hooks/useLemtelAccess';

// JsSIP loaded via CDN
declare global { interface Window { JsSIP: any; } }

type SipStatus = 'disconnected' | 'connecting' | 'registered' | 'failed' | 'incall';

export function LemtelSoftphone() {
  const { user } = useAuth();
  const { isMember } = useLemtelAccess();
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<SipStatus>('disconnected');
  const [extension, setExtension] = useState<string>('');
  const [number, setNumber] = useState('');
  const [muted, setMuted] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const uaRef = useRef<any>(null);
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!isMember || !user) return;
    (async () => {
      // Load JsSIP from CDN
      if (!window.JsSIP) {
        await new Promise<void>((res) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/jssip@3.10.0/dist/jssip.min.js';
          s.onload = () => res();
          document.head.appendChild(s);
        });
      }

      const { data: spUser } = await supabase
        .from('lemtel_softphone_users')
        .select('extension, sip_domain, display_name')
        .eq('portal_user_id', user.id).maybeSingle();
      if (!spUser) return;
      setExtension(spUser.extension);

      const { data: cfg } = await supabase.from('lemtel_config_safe').select('key, value')
        .in('key', ['FUSIONPBX_WSS_URL', 'FUSIONPBX_DOMAIN']);
      const c = Object.fromEntries((cfg || []).map((r: any) => [r.key, r.value]));
      if (!c.FUSIONPBX_WSS_URL || !c.FUSIONPBX_DOMAIN) return;

      // For password, need an edge function. Skip auto-register if missing.
      // Phase 1: just attempt to set up UA without password; user will see registration failure status.
      try {
        const socket = new window.JsSIP.WebSocketInterface(c.FUSIONPBX_WSS_URL);
        const ua = new window.JsSIP.UA({
          sockets: [socket],
          uri: `sip:${spUser.extension}@${c.FUSIONPBX_DOMAIN}`,
          register: false, // will enable after fetching password
          user_agent: 'AVA Softphone 1.0',
        });
        ua.on('connected', () => setStatus('registered'));
        ua.on('disconnected', () => setStatus('disconnected'));
        ua.on('registered', () => {
          setStatus('registered');
          void import('@/lib/native/requestPermissionsAfterLogin').then(m => m.requestPermissionsAfterLogin());
        });
        ua.on('registrationFailed', () => setStatus('failed'));
        ua.on('newRTCSession', (e: any) => {
          sessionRef.current = e.session;
          e.session.on('confirmed', () => setStatus('incall'));
          e.session.on('ended', () => { setStatus('registered'); sessionRef.current = null; });
          e.session.on('failed', () => { setStatus('registered'); sessionRef.current = null; });
          e.session.connection?.addEventListener('track', (ev: any) => {
            if (audioRef.current) audioRef.current.srcObject = ev.streams[0];
          });
        });
        setStatus('connecting');
        ua.start();
        uaRef.current = ua;
      } catch (err) {
        console.error('[Lemtel Softphone] init failed', err);
        setStatus('failed');
      }
    })();
    return () => { uaRef.current?.stop?.(); };
  }, [user, isMember]);

  if (!isMember) return null;

  const call = async () => {
    if (!uaRef.current || !number) return;
    setMicDenied(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      uaRef.current.call(`sip:${number}@portal.lemtel.tel`, { mediaConstraints: { audio: true, video: false } });
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') setMicDenied(true);
      else console.error(e);
    }
  };
  const openMicSettings = async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.getPlatform() === 'ios') window.open('app-settings:', '_system');
      else if (Capacitor.getPlatform() === 'android') {
        const { App } = await import('@capacitor/app');
        const info = await App.getInfo();
        window.open(`package:${info.id}`, '_system');
      }
    } catch { /* web preview */ }
  };
  const hangup = () => sessionRef.current?.terminate?.();
  const toggleMute = () => {
    if (!sessionRef.current) return;
    if (muted) sessionRef.current.unmute({ audio: true }); else sessionRef.current.mute({ audio: true });
    setMuted(!muted);
  };

  const dot = status === 'registered' ? 'bg-green-500' : status === 'incall' ? 'bg-red-500' : status === 'connecting' ? 'bg-yellow-500' : 'bg-gray-400';

  return (
    <>
      <audio ref={audioRef} autoPlay />
      {!expanded ? (
        <button onClick={() => setExpanded(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition z-50">
          <Phone className="w-6 h-6" />
          <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${dot} ring-2 ring-background`} />
        </button>
      ) : (
        <div className="fixed bottom-6 right-6 w-80 h-[480px] bg-card border rounded-2xl shadow-2xl flex flex-col z-50">
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Softphone</span>
              <span className="text-xs text-muted-foreground">{extension ? `Ext. ${extension}` : 'Not configured'}</span>
              <span className={`w-2 h-2 rounded-full ${dot}`} />
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(false)}>
              <Minimize2 className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 p-4 flex flex-col gap-3">
            <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Enter number..." className="text-center text-lg" />
            {micDenied && (
              <div role="alert" className="flex items-start gap-2 rounded-md p-2 text-xs bg-destructive/10 border border-destructive/40">
                <MicOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-destructive" />
                <div className="flex-1">
                  Microphone disabled. Enable it in Settings → AVA Softphone → Microphone.
                  <button onClick={openMicSettings} className="ml-2 underline font-semibold text-primary">Open Settings</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
                <Button key={k} variant="outline" onClick={() => setNumber(number + k)} className="h-12">{k}</Button>
              ))}
            </div>
            <div className="flex gap-2 mt-auto">
              {status === 'incall' ? (
                <>
                  <Button variant="outline" onClick={toggleMute} className="flex-1">
                    {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <Button variant="destructive" onClick={hangup} className="flex-1">
                    <PhoneOff className="w-4 h-4 mr-2" /> End
                  </Button>
                </>
              ) : (
                <Button onClick={call} disabled={!number || status !== 'registered'} className="w-full bg-green-600 hover:bg-green-700">
                  <Phone className="w-4 h-4 mr-2" /> Call
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
