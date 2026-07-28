import React, { useEffect, useState } from 'react';
import { colors, font, radius } from '../lib/theme';
import { mobileApi } from '../lib/mobileApi';
import { Card } from '../components/ui/Primitives';
import { useMobileCredentials } from '../hooks/useMobileCredentials';
import { useT } from '../lib/i18n';



type Step = {
  label: string;
  status: 'pending' | 'ok' | 'fail';
  detail?: string;
};

/**
 * Playback debug checklist. Walks through the exact pipeline a recording
 * takes from the PBX to the <audio> element and shows where it breaks.
 * Reachable from CallDetailScreen → "Debug playback" link.
 */
export default function RecordingDebugScreen({ callId, onBack }: { callId: string; onBack: () => void }) {
  const mobile = useMobileCredentials();
  const { lang } = useT();
  const fr = lang === 'fr';
  const [steps, setSteps] = useState<Step[]>([
    { label: fr ? '1. Résoudre le contexte organisation' : '1. Resolve organization context', status: 'pending' },
    { label: fr ? '2. Demander une URL signée' : '2. Request signed recording URL', status: 'pending' },
    { label: fr ? '3. Vérifier la signature (serveur joignable ?)' : '3. HEAD the signed URL (server reachable?)', status: 'pending' },
    { label: fr ? '4. Inspecter Content-Type / Content-Length' : '4. Inspect Content-Type / Content-Length', status: 'pending' },
    { label: fr ? '5. Tester la lecture <audio>' : '5. Probe <audio> canplaythrough', status: 'pending' },
  ]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);


  const set = (i: number, patch: Partial<Step>) =>
    setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (cancelled) return;
        const orgId = mobile.organizationId || null;
        if (!orgId) {
          set(0, { status: 'fail', detail: 'No organizationId found for this user.' });
          return;
        }
        set(0, { status: 'ok', detail: `org ${orgId.slice(0, 8)}…` });

        // Step 2: signed URL via mobile edge function
        let res: any;
        try {
          res = await mobileApi.voicemailAudio({ xml_cdr_uuid: callId, organization_id: orgId });

        } catch (e: any) {
          set(1, { status: 'fail', detail: e?.message || 'invoke failed' });
          return;
        }
        if (!res?.url) {
          set(1, { status: 'fail', detail: `${res?.error || 'NO_URL'} — ${res?.message || 'edge function returned no URL'}` });
          return;
        }
        const url: string = res.url;
        setSignedUrl(url);
        set(1, { status: 'ok', detail: url.slice(0, 64) + '…' });

        // Step 3: HEAD request
        let head: Response | null = null;
        try {
          head = await fetch(url, { method: 'HEAD' });
          if (!head.ok) {
            set(2, { status: 'fail', detail: `HTTP ${head.status} ${head.statusText}` });
            return;
          }
          set(2, { status: 'ok', detail: `HTTP ${head.status}` });
        } catch (e: any) {
          set(2, { status: 'fail', detail: e?.message || 'network error' });
          return;
        }

        // Step 4: content metadata
        const ct = head.headers.get('content-type') || '(none)';
        const cl = head.headers.get('content-length') || '(unknown)';
        const looksAudio = /audio|octet-stream|mpeg|wav|mp4|ogg/i.test(ct);
        set(3, {
          status: looksAudio ? 'ok' : 'fail',
          detail: `type=${ct} · bytes=${cl}`,
        });

        // Step 5: <audio> canplaythrough probe
        await new Promise<void>((resolve) => {
          const audio = new Audio();
          let done = false;
          const finish = (ok: boolean, detail: string) => {
            if (done) return; done = true;
            set(4, { status: ok ? 'ok' : 'fail', detail });
            audio.src = ''; resolve();
          };
          audio.oncanplaythrough = () => finish(true, `duration ${audio.duration.toFixed(1)}s`);
          audio.onerror = () => finish(false, `media error code=${audio.error?.code ?? '?'}`);
          setTimeout(() => finish(false, 'timeout after 8s waiting for canplaythrough'), 8_000);
          audio.preload = 'auto';
          audio.src = url;
          audio.load();
        });
      } catch (e: any) {
        const open = steps.findIndex((s) => s.status === 'pending');
        if (open >= 0) set(open, { status: 'fail', detail: e?.message || String(e) });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, mobile.organizationId]);

  const badge = (s: Step['status']) =>
    s === 'ok' ? { c: colors.success, t: '✓' } :
    s === 'fail' ? { c: colors.danger, t: '✗' } :
                   { c: colors.mutedSilver, t: '…' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 28px' }}>
      <button onClick={onBack} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '8px 12px', marginBottom: 12,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${colors.border}`,
        borderRadius: 999, color: colors.textIce, fontSize: font.sm, cursor: 'pointer',
      }}>← {fr ? 'Retour' : 'Back'}</button>

      <h1 style={{ fontSize: font.xxl, color: colors.textIce, margin: '4px 0 4px', fontWeight: 800 }}>
        {fr ? 'Diagnostic de lecture' : 'Playback debug'}
      </h1>
      <div style={{ fontSize: font.sm, color: colors.mutedSilver, marginBottom: 14 }}>
        {fr ? 'Vérifie le pipeline d’enregistrement pour' : 'Verifies the recording pipeline for'} <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{callId.slice(0, 12)}…</span>
      </div>


      <Card>
        {steps.map((s, i) => {
          const b = badge(s.status);
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 0',
              borderBottom: i === steps.length - 1 ? 'none' : `1px solid ${colors.border}`,
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 999,
                background: `${b.c}22`, color: b.c,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 13, flexShrink: 0,
              }}>{b.t}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: font.base, color: colors.textIce, fontWeight: 700 }}>{s.label}</div>
                {s.detail && (
                  <div style={{
                    fontSize: 11, color: s.status === 'fail' ? colors.danger : colors.mutedSilver,
                    marginTop: 3, fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all',
                  }}>{s.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {signedUrl && (
        <div style={{ marginTop: 14, fontSize: 10, color: colors.mutedSilver, fontFamily: 'JetBrains Mono, monospace', wordBreak: 'break-all', padding: 10, border: `1px solid ${colors.border}`, borderRadius: radius.md }}>
          {signedUrl}
        </div>
      )}
    </div>
  );
}
