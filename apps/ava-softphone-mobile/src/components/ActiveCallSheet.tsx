import React, { useEffect, useState } from 'react';
import { ImpactStyle } from '@capacitor/haptics';
import { colors, font, gradients, radius, shadow } from '../lib/theme';
import { getCallStateVisual } from '../lib/callStateAccent';
import CallQualityGauge from './CallQualityGauge';
import type { AudioProfile } from '../lib/sip/audioProfile';
import { EMPTY_QUALITY } from '../lib/sip/callQuality';
import { getAudioState, onAudioStateChange, setRoute, type AudioRoute, type AudioState } from '../lib/sip/audioOutput';
import CallTimeline, { type CallPhase } from './CallTimeline';
import CallStatusBadge from './CallStatusBadge';
import { isVibrationEnabled } from '../lib/sip/ringPreferences';
import IncomingCallerPanel from './IncomingCallerPanel';
import { lookupCaller, type CallerLookup } from '../lib/sip/callerLookup';
import { formatSipParty } from '../lib/sip/formatSipParty';
import { useCallActionBridge } from '../lib/sip/useCallActionBridge';
// LiveTranscriptPanel intentionally not imported — live transcription disabled during calls.
import { useMobileCredentials } from '../hooks/useMobileCredentials';
import { useT } from '../lib/i18n';

const PROFILE_CYCLE: AudioProfile[] = ['auto', 'hd', 'low-bandwidth'];

export default function ActiveCallSheet({
  sp,
  haptic,
}: {
  sp: any;
  haptic: (s?: ImpactStyle) => Promise<void>;
}) {
  const { tx } = useT();
  const { organizationId } = useMobileCredentials();
  const [timer, setTimer] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [audio, setAudio] = useState<AudioState>(getAudioState());
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' | 'info' } | null>(null);
  const [recPending, setRecPending] = useState(false);
  const [callerLookup, setCallerLookup] = useState<CallerLookup | null>(null);

  useEffect(() => onAudioStateChange(setAudio), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  // Surface remote end reason (busy, declined, unavailable…) when call ends.
  const endReasonText: string | null = sp.endReason ?? sp.lastEndReason ?? null;
  useEffect(() => {
    if (endReasonText) setToast({ text: endReasonText, tone: 'err' });
  }, [endReasonText]);

  const switchRoute = async (next: AudioRoute) => {
    haptic(ImpactStyle.Light);
    try {
      const ok = await setRoute(next);
      if (!ok) setToast({ text: tx(`Bascule audio impossible vers ${routeLabel(next)}`, `Unable to switch audio to ${routeLabel(next)}`), tone: 'err' });
    } catch (e: any) {
      const msg = e?.message ? `: ${e.message}` : '';
      setToast({ text: tx(`Impossible de basculer sur ${routeLabel(next)}${msg}`, `Unable to switch to ${routeLabel(next)}${msg}`), tone: 'err' });
    }
  };

  useEffect(() => {
    if (sp.snap.callState !== 'active' && sp.snap.callState !== 'held') { setTimer(0); return; }
    if (!sp.snap.startedAt) return;
    const id = setInterval(() => {
      setTimer(Math.floor((Date.now() - (sp.snap.startedAt || Date.now())) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [sp.snap.callState, sp.snap.startedAt]);

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const rawRemote = sp.snap.remoteParty || sp.snap.remoteUri || '';
  const lang: 'fr' | 'en' = (typeof localStorage !== 'undefined' && localStorage.getItem('ava.mobile.lang') === 'en') ? 'en' : 'fr';
  const party = formatSipParty(String(rawRemote), lang);
  const remote = party.name;
  const isIncoming = sp.snap.callState === 'ringing-in';
  const isOutgoing = sp.snap.callState === 'ringing-out';
  const onHold = !!sp.snap.onHold || sp.snap.callState === 'held';

  // Trigger caller-ID lookup as soon as we know we're ringing (incoming or outgoing).
  useEffect(() => {
    const phone = sp.snap.remoteNumber || sp.snap.remoteParty || sp.snap.remoteUri || '';
    if (!phone || (!isIncoming && !isOutgoing)) { setCallerLookup(null); return; }
    let cancelled = false;
    lookupCaller(String(phone)).then((r) => { if (!cancelled) setCallerLookup(r); });
    return () => { cancelled = true; };
  }, [isIncoming, isOutgoing, sp.snap.remoteNumber, sp.snap.remoteParty, sp.snap.remoteUri]);
  const inCall = sp.snap.callState === 'active' || sp.snap.callState === 'held' || onHold;
  const isTransfer = !!sp.snap.transferring;
  const isEnded = sp.snap.callState === 'ended' || sp.snap.callState === 'idle';

  // Route notification-button taps (Android) and CallKit actions (iOS) to the
  // same sp handlers so the user can control the call from the lockscreen.
  useCallActionBridge({
    onAnswer: () => sp.answer?.(),
    onDecline: () => sp.hangup?.(),
    onHangup: () => sp.hangup?.(),
    onHold: () => sp.hold?.(),
    onResume: () => sp.unhold?.(),
    onMute: () => (sp.snap.muted ? sp.unmute?.() : sp.mute?.()),
  }, inCall || isIncoming || isOutgoing);

  // Native audio-engine status (iOS plugin). When 'starting' or 'retrying' the
  // RTP pipeline isn't ready yet, so audio-affecting buttons must be disabled.
  const audioStatus: 'idle' | 'starting' | 'running' | 'retrying' | 'error' =
    sp.audioStatus ?? sp.snap.audioStatus ?? 'idle';
  const audioError: string = sp.audioError ?? sp.snap.audioError ?? '';
  const audioRestartAttempts: number = sp.audioRestartAttempts ?? sp.snap.audioRestartAttempts ?? 0;
  const audioBusy = audioStatus === 'starting' || audioStatus === 'retrying';
  const audioFailed = audioStatus === 'error';

  // State-aware accent — see lib/callStateAccent.ts (single source of truth, snapshot-tested).
  const visual = getCallStateVisual(sp.snap.callState, { transferring: isTransfer });
  const stateAccent = visual.accent;
  const stateLabel = visual.label;

  const safeCall = (name: string, fn?: () => void) => {
    if (typeof fn !== 'function') {
      console.info(`[ActiveCall] ${name} not supported by SIP layer yet.`);
      return;
    }
    try { fn(); } catch (e) { console.warn(`[ActiveCall] ${name} failed`, e); }
  };

  const transfer = () => {
    const target = window.prompt(tx('Transférer vers extension ou numéro :', 'Transfer to extension or number:'));
    if (target) safeCall('transfer', () => sp.transfer?.(target));
  };
  const park = () => safeCall('park', () => sp.park?.());
  const addCall = () => {
    const target = window.prompt(tx("Ajouter l'appel à :", 'Add call to:'));
    if (target) safeCall('addCall', () => sp.addCall?.(target) ?? sp.call?.(target));
  };
  const record = async () => {
    const isRec = !!sp.snap.recording;
    const fn = isRec ? sp.stopRecord : sp.startRecord;
    setRecPending(true);
    setToast({ text: isRec ? tx("Arrêt de l'enregistrement…", 'Stopping recording…') : tx("Démarrage de l'enregistrement…", 'Starting recording…'), tone: 'info' });
    let nativeErr: any = null;
    try {
      if (typeof fn === 'function') {
        await fn();
        setToast({ text: isRec ? tx("Enregistrement arrêté ✓", 'Recording stopped ✓') : tx("Enregistré ✓ — la conversation est capturée", 'Recording ✓ — conversation is captured'), tone: 'ok' });
        setRecPending(false);
        return;
      }
    } catch (e: any) {
      nativeErr = e;
      console.error('[ActiveCall] native record failed', e?.message || e);
    }
    // Fallback: ask the PBX directly via fusionpbx-proxy.
    try {
      const callUuid = (sp.snap as any).callId || (sp.snap as any).callUuid || '';
      const { supabase } = await import('../lib/mobileSupabase');
      const { data, error } = await supabase.functions.invoke('fusionpbx-proxy', {
        body: { action: 'record-call', uuid: callUuid, start: !isRec, domain_name: (sp.snap as any).domain },
      });
      if (error || !data?.ok) throw new Error(error?.message || data?.error || 'PBX rejected uuid_record');
      setToast({ text: isRec ? tx("Arrêt côté PBX ✓", 'Stopped via PBX ✓') : tx("Enregistré côté PBX ✓", 'Recording via PBX ✓'), tone: 'ok' });
    } catch (e: any) {
      const msg = nativeErr?.message || e?.message || tx('erreur inconnue', 'unknown error');
      console.error('[ActiveCall] proxy record fallback failed', e?.message || e);
      setToast({ text: tx(`Erreur enregistrement: ${msg}`, `Recording error: ${msg}`), tone: 'err' });
    } finally {
      setRecPending(false);
    }
  };


  const avatarGradient =
    isTransfer ? `linear-gradient(135deg, ${colors.avaViolet} 0%, ${colors.avaCyan} 100%)` :
    onHold     ? `linear-gradient(135deg, ${colors.warning} 0%, ${colors.signalGold} 100%)` :
    isEnded    ? `linear-gradient(135deg, ${colors.graphite2} 0%, ${colors.midnight2} 100%)` :
    gradients.call;

  return (
    <div style={sheetStyle}>
      <style>{callButtonCss}</style>
      {/* Call state timeline (composition → sonnerie → connecté) */}
      <CallTimeline
        phase={(sp.callPhase as CallPhase) ?? (isOutgoing ? 'dialing' : isIncoming ? 'ringing' : inCall ? 'active' : isEnded ? 'ended' : 'dialing')}
        endReason={endReasonText}
        endCode={sp.lastSipCode ?? null}
      />
      {/* Live transcription removed during calls — caused app freeze (background audio tap + main-thread work). Transcription now only runs post-call. */}
      {/* Top brand strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 16px 8px', padding: '10px 12px', borderRadius: radius.lg, background: 'rgba(255,255,255,0.04)', border: `1px solid ${stateAccent}55`, boxShadow: shadow.glass }}>
        <CallStatusBadge
          callState={sp.snap.callState}
          incoming={isIncoming}
          ringing={isOutgoing || isIncoming}
          vibrating={isIncoming && isVibrationEnabled()}
        />

        <CallQualityGauge
          quality={sp.snap.quality || sp.quality || EMPTY_QUALITY}
          profile={(sp.audioProfile as AudioProfile) || 'auto'}
          onCycleProfile={() => {
            const cur = (sp.audioProfile as AudioProfile) || 'auto';
            const next = PROFILE_CYCLE[(PROFILE_CYCLE.indexOf(cur) + 1) % PROFILE_CYCLE.length];
            haptic(ImpactStyle.Light);
            sp.setAudioProfile?.(next);
          }}
        />
      </div>
      {/* Caller ID — only during incoming ring */}
      {isIncoming && (
        // Pass the raw number (not the formatted name) so IncomingCallerPanel
        // can display the actual extension/number while the lookup is in flight.
        <IncomingCallerPanel lookup={callerLookup} rawNumber={String(sp.snap.callerNumber || sp.snap.remoteNumber || sp.snap.remoteUri || remote)} />
      )}

      {/* Identity */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: avatarGradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 54, fontWeight: 300, color: colors.textIce,
          boxShadow: `0 30px 80px ${stateAccent}33, inset 0 1px 0 rgba(255,255,255,0.32)`,
          position: 'relative',
          opacity: isEnded ? 0.6 : 1,
          transition: 'background .3s ease, opacity .3s ease',
        }}>
          {String(remote).charAt(0).toUpperCase()}
          {(isIncoming || isOutgoing) && (
            <span style={{
              position: 'absolute', inset: -6, borderRadius: '50%',
              border: `2px solid ${stateAccent}`,
              animation: 'pulse-ring 1.4s ease-out infinite',
            }} />
          )}
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: colors.textIce, textAlign: 'center', padding: '0 24px', wordBreak: 'break-word' }}>{remote}</div>
        {party.subtitle && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace',
            padding: party.isInternal ? '4px 10px' : 0,
            borderRadius: 999,
            background: party.isInternal ? 'rgba(35,214,255,0.10)' : 'transparent',
            border: party.isInternal ? `1px solid ${colors.avaCyan}55` : 'none',
            letterSpacing: 0.5,
          }}>
            {party.isInternal && <span style={{ fontSize: 10 }}>●</span>}
            {party.subtitle}
          </div>
        )}
        <div style={{ fontSize: 13, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace' }}>
          {isIncoming && (party.isInternal
            ? (lang === 'en' ? 'Internal incoming call…' : 'Appel interne entrant…')
            : (lang === 'en' ? 'Incoming call…' : 'Appel entrant…'))}
          {isOutgoing && (party.isInternal
            ? (lang === 'en' ? 'Calling internal extension…' : 'Appel interne…')
            : (lang === 'en' ? 'Calling…' : 'Appel en cours…'))}
          {inCall && fmt(timer)}
          {isTransfer && (lang === 'en' ? 'Transferring call…' : 'Transfert en cours…')}
          {isEnded && (lang === 'en' ? 'Call has ended' : 'Appel terminé')}
        </div>
        {sp.snap.muted && inCall && (
          <div style={{ fontSize: 11, color: colors.warning, letterSpacing: 1.2, fontWeight: 700, textTransform: 'uppercase' }}>Microphone muted</div>
        )}
        {sp.snap.recording && inCall && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(220,38,38,0.18)',
            border: `1px solid ${colors.danger}88`,
            fontSize: 11, letterSpacing: 1.4, fontWeight: 800,
            color: '#ffd5d5', textTransform: 'uppercase',
            boxShadow: `0 0 24px -6px ${colors.danger}`,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: colors.danger,
              animation: 'rec-pulse 1.2s ease-in-out infinite',
              boxShadow: `0 0 10px ${colors.danger}`,
            }} />
            {tx('Enregistrement en cours', 'Recording in progress')}
          </div>
        )}

        {inCall && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '5px 12px', borderRadius: 999,
            background: 'rgba(255,255,255,0.06)',
            border: `1px solid ${colors.border}`,
            fontSize: 11, letterSpacing: 1.1, fontWeight: 700,
            color: colors.mutedSilver, textTransform: 'uppercase',
          }}>
            <span style={{ fontSize: 13 }}>{routeIcon(audio.route)}</span>
            <span>{tx('Sortie', 'Output')} · {routeLabel(audio.route)}</span>
            {audio.busy && <span style={{ color: colors.avaCyan }}>…</span>}
          </div>
        )}
      </div>

      {/* AI Assist drawer */}
      {aiOpen && (
        <div style={{
          margin: '0 16px 12px', padding: 14, borderRadius: radius.lg,
          background: `linear-gradient(135deg, rgba(122,76,255,0.20), rgba(35,214,255,0.14), rgba(255,255,255,0.04))`,
          border: `1px solid ${colors.borderAI}`,
          boxShadow: shadow.glass,
        }}>
          <div style={{ fontSize: 10, color: colors.avaCyan, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 6 }}>AVA Live Assist</div>
          <div style={{ fontSize: 13, color: colors.textIce, lineHeight: 1.5 }}>
            Listening… AVA will surface objections, suggest next steps and capture action items when the call ends.
          </div>
        </div>
      )}

      {/* Control grid */}
      {inCall && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18,
          padding: '6px 20px 14px',
        }}>
          <Ctrl label={sp.snap.muted ? 'Unmute' : 'Mute'} icon="🎙" active={sp.snap.muted}
            disabled={audioBusy}
            onClick={() => { haptic(); sp.snap.muted ? sp.unmute() : sp.mute(); }} />
          <Ctrl label={onHold ? 'Resume' : 'Hold'} icon="⏸" active={onHold}
            disabled={audioBusy}
            onClick={() => { haptic(); onHold ? sp.unhold() : sp.hold(); }} />
          <Ctrl
            label={audio.route === 'speaker' ? 'Speaker' : 'Speaker'}
            icon={audio.busy && audio.route !== 'speaker' ? '…' : '🔊'}
            active={audio.route === 'speaker'}
            disabled={audio.busy || audioBusy}
            onClick={() => switchRoute(audio.route === 'speaker' ? 'earpiece' : 'speaker')}
          />
          <Ctrl
            label="Bluetooth"
            icon={audio.busy && audio.route !== 'bluetooth' ? '…' : '🎧'}
            active={audio.route === 'bluetooth'}
            tone={audio.bluetoothAvailable ? 'default' : 'default'}
            disabled={audio.busy || audioBusy || !audio.bluetoothAvailable}
            onClick={() => switchRoute(audio.route === 'bluetooth' ? 'earpiece' : 'bluetooth')}
          />
          <Ctrl label="Keypad" icon="⌨" active={showKeypad}
            onClick={() => { haptic(); setShowKeypad((v) => !v); }} />
          <Ctrl label="Transfer" icon="↗" disabled={audioBusy}
            onClick={() => { haptic(ImpactStyle.Medium); transfer(); }} />
          <Ctrl label="Add" icon="＋" disabled={audioBusy}
            onClick={() => { haptic(ImpactStyle.Medium); addCall(); }} />
          <Ctrl label="Park" icon="🅿" disabled={audioBusy}
            onClick={() => { haptic(ImpactStyle.Medium); park(); }} />
          <Ctrl
            label={
              audioBusy ? (audioStatus === 'retrying' ? `Retry ${audioRestartAttempts}` : 'Audio…')
              : recPending ? (sp.snap.recording ? tx('Arrêt…', 'Stopping…') : tx('Démarrage…', 'Starting…'))
              : sp.snap.recording ? 'Stop Rec' : 'Record'
            }
            icon={audioBusy || recPending ? '…' : sp.snap.recording ? '■' : '●'}
            tone={audioFailed ? 'danger' : sp.snap.recording ? 'danger' : 'default'}
            active={!!sp.snap.recording}
            disabled={audioBusy || audioFailed || recPending}
            onClick={() => { haptic(ImpactStyle.Medium); record(); }}
          />
          <Ctrl label="AVA" icon="✦" tone="ai" active={aiOpen}
            onClick={() => { haptic(); setAiOpen((v) => !v); }} />
        </div>
      )}

      {(audioBusy || audioFailed) && inCall && (
        <div style={{
          margin: '0 16px 10px', padding: '10px 14px', borderRadius: radius.md,
          background: audioFailed ? 'rgba(220,38,38,0.18)' : 'rgba(35,214,255,0.12)',
          border: `1px solid ${audioFailed ? colors.danger : colors.avaCyan}55`,
          color: audioFailed ? '#ffd5d5' : colors.textIce,
          fontSize: 12, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>{audioFailed ? '⚠️' : '⏳'}</span>
          <span style={{ flex: 1 }}>
            {audioFailed
              ? `Audio engine error — ${audioError || 'unable to start RTP audio'}. Try reconnecting.`
              : audioStatus === 'retrying'
                ? `Reconnecting audio engine… attempt ${audioRestartAttempts}/8`
                : 'Starting audio engine…'}
          </span>
          {audioFailed && (
            <button onClick={() => sp.reconnect?.()} style={{
              border: `1px solid ${colors.danger}`, background: 'transparent',
              color: '#fff', borderRadius: radius.sm, padding: '4px 10px',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}>Retry</button>
          )}
        </div>
      )}

      {/* Primary action row */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 28, paddingBottom: 'calc(36px + var(--safe-bottom))' }}>
        {isIncoming ? (
          <>
            <BigButton color={colors.danger} onClick={() => { haptic(ImpactStyle.Heavy); sp.hangup(); }} label="Decline" icon="✕" />
            <BigButton color={colors.success} onClick={() => { haptic(ImpactStyle.Medium); sp.answer(); }} label="Accept" icon="✓" />
          </>
        ) : (
          <BigButton color={colors.danger} onClick={() => { haptic(ImpactStyle.Heavy); sp.hangup(); }} label={isOutgoing ? 'Cancel' : 'End call'} icon="✕" />
        )}
      </div>

      {showKeypad && inCall && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 'calc(120px + var(--safe-bottom))',
          padding: '12px 16px',
          background: 'rgba(14,27,61,0.92)', backdropFilter: 'blur(18px) saturate(170%)',
          borderTop: `1px solid ${colors.border}`,
          boxShadow: '0 -18px 46px -24px rgba(0,0,0,0.6)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {['1','2','3','4','5','6','7','8','9','*','0','#'].map((d) => (
              <button key={d} onClick={() => { haptic(); sp.sendDtmf?.(d) ?? sp.sendDTMF?.(d); }} style={{
                padding: '14px 0', borderRadius: radius.md, background: colors.graphite2,
                border: `1px solid ${colors.border}`, color: colors.textIce,
                fontSize: 20, fontWeight: 500, cursor: 'pointer',
              }}>{d}</button>
            ))}
          </div>
        </div>
      )}

      {toast && (() => {
        const palette =
          toast.tone === 'ok'   ? { bg: 'rgba(34,197,94,0.94)',  glow: 'rgba(34,197,94,0.55)' } :
          toast.tone === 'info' ? { bg: 'rgba(35,214,255,0.92)', glow: 'rgba(35,214,255,0.55)' } :
                                  { bg: 'rgba(220,38,38,0.94)',  glow: 'rgba(220,38,38,0.55)' };
        return (
          <div role="status" aria-live="polite" style={{
            position: 'absolute', left: 16, right: 16, bottom: 'calc(220px + var(--safe-bottom))',
            padding: '12px 16px', borderRadius: radius.md,
            background: palette.bg, color: '#fff',
            fontSize: 13, fontWeight: 600, textAlign: 'center',
            boxShadow: `0 18px 40px -12px ${palette.glow}`,
            backdropFilter: 'blur(12px)',
          }}>
            {toast.text}
          </div>
        );
      })()}

    </div>
  );
}

function routeLabel(r: AudioRoute) {
  const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('ava.mobile.lang') === 'en') ? 'en' : 'fr';
  if (lang === 'en') return r === 'speaker' ? 'Speaker' : r === 'bluetooth' ? 'Bluetooth' : 'Earpiece';
  return r === 'speaker' ? 'Haut-parleur' : r === 'bluetooth' ? 'Bluetooth' : 'Écouteur';
}
function routeIcon(r: AudioRoute) {
  return r === 'speaker' ? '🔊' : r === 'bluetooth' ? '🎧' : '📞';
}

function Ctrl({ label, icon, onClick, active, tone = 'default', disabled }: {
  label: string; icon: string; onClick: () => void; active?: boolean;
  tone?: 'default' | 'danger' | 'ai';
  disabled?: boolean;
}) {
  const accent = tone === 'danger' ? colors.danger : tone === 'ai' ? colors.avaViolet : colors.blueGlow;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`call-ctrl ${active ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
      style={{ ['--accent' as any]: accent }}
    >
      <span className="call-ctrl-orb">{icon}</span>
      <span style={{ fontSize: 10, color: colors.mutedSilver, letterSpacing: 0.6, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

function BigButton({ color, onClick, label, icon }: { color: string; onClick: () => void; label: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      className="call-big"
      style={{ ['--accent' as any]: color }}
    >
      <span className="call-big-orb">{icon}</span>
      <span style={{ fontSize: 11, color: colors.mutedSilver, letterSpacing: 0.8, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

const callButtonCss = `
.call-ctrl,.call-big{display:flex;flex-direction:column;align-items:center;gap:7px;background:transparent;border:0;color:${colors.textIce};cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;position:relative;isolation:isolate;}
.call-ctrl{min-width:68px;}
.call-big{gap:9px;}
.call-ctrl-orb,.call-big-orb{position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:50%;color:${colors.textIce};border:1px solid rgba(255,255,255,.22);background:radial-gradient(circle at 30% 18%,rgba(255,255,255,.34),rgba(255,255,255,.10) 32%,rgba(255,255,255,.045) 64%),linear-gradient(145deg,rgba(255,255,255,.16),rgba(255,255,255,.045));box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 -18px 28px rgba(0,0,0,.22),0 14px 30px -18px var(--accent),0 0 0 0 rgba(255,255,255,0);backdrop-filter:blur(18px) saturate(170%);transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s ease,border-color .18s ease,background .18s ease,color .18s ease;}
.call-ctrl-orb{width:62px;height:62px;font-size:22px;}
.call-big-orb{width:76px;height:76px;font-size:31px;background:radial-gradient(circle at 30% 18%,rgba(255,255,255,.42),rgba(255,255,255,.14) 28%,color-mix(in srgb,var(--accent) 82%,transparent) 100%),linear-gradient(145deg,var(--accent),rgba(255,255,255,.08));box-shadow:inset 0 1px 0 rgba(255,255,255,.42),inset 0 -22px 34px rgba(0,0,0,.28),0 16px 42px -12px var(--accent);}
.call-ctrl-orb::before,.call-big-orb::before{content:"";position:absolute;inset:-42%;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.72) 48%,transparent 62%);transform:translateX(-76%) rotate(8deg);opacity:.55;transition:transform .42s ease;}
.call-ctrl-orb::after,.call-big-orb::after{content:"";position:absolute;inset:12%;border-radius:50%;border:1px solid rgba(255,255,255,.14);box-shadow:0 0 22px rgba(255,255,255,.08);pointer-events:none;}
.call-ctrl:hover:not(:disabled) .call-ctrl-orb,.call-big:hover:not(:disabled) .call-big-orb{transform:translateY(-3px) scale(1.035);border-color:color-mix(in srgb,var(--accent) 70%,white);box-shadow:inset 0 1px 0 rgba(255,255,255,.42),inset 0 -18px 28px rgba(0,0,0,.20),0 18px 42px -15px var(--accent),0 0 26px -8px var(--accent);}
.call-ctrl:hover:not(:disabled) .call-ctrl-orb::before,.call-big:hover:not(:disabled) .call-big-orb::before{transform:translateX(76%) rotate(8deg);}
.call-ctrl:active:not(:disabled) .call-ctrl-orb,.call-big:active:not(:disabled) .call-big-orb{transform:translateY(1px) scale(.94);box-shadow:inset 0 0 36px color-mix(in srgb,var(--accent) 38%,transparent),inset 0 1px 0 rgba(255,255,255,.5),0 8px 22px -14px var(--accent);}
.call-ctrl.is-active .call-ctrl-orb{color:var(--accent);background:radial-gradient(circle at 30% 18%,rgba(255,255,255,.38),color-mix(in srgb,var(--accent) 34%,transparent) 38%,rgba(255,255,255,.06) 100%);border-color:color-mix(in srgb,var(--accent) 70%,white);box-shadow:inset 0 1px 0 rgba(255,255,255,.44),inset 0 -18px 28px rgba(0,0,0,.20),0 16px 44px -14px var(--accent),0 0 24px -8px var(--accent);}
.call-ctrl.is-disabled{cursor:not-allowed;opacity:.48;filter:saturate(.6);}
.call-ctrl.is-disabled .call-ctrl-orb{box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -18px 28px rgba(0,0,0,.28);}
@media (prefers-reduced-motion:reduce){.call-ctrl-orb,.call-big-orb,.call-ctrl-orb::before,.call-big-orb::before{transition:none;}}
@keyframes rec-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.45;transform:scale(1.35);}}
`;


const sheetStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 100,
  background: `radial-gradient(900px 600px at 50% -12%, rgba(0,35,230,0.32), transparent 66%), radial-gradient(720px 520px at 100% 100%, rgba(224,168,0,0.20), transparent 60%), linear-gradient(180deg, #060C1C 0%, #0A1429 50%, #0E1B3D 100%)`,
  paddingTop: 'calc(36px + var(--safe-top))',
  display: 'flex', flexDirection: 'column',
  color: colors.textIce,
};
