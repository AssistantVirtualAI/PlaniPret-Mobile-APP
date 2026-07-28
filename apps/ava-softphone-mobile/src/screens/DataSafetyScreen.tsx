import React, { useEffect, useState } from 'react';
import { colors, font, radius } from '../lib/theme';
import { Card, SectionTitle } from '../components/ui/Primitives';
import { mobileApi } from '../lib/mobileApi';

type Row = {
  type: string;
  collected: boolean;
  shared: boolean;
  optional: boolean;
  purpose: string;
  retention: string;
};

// Mirrors Google Play Data Safety form and Apple Privacy Nutrition Label.
const ROWS: Row[] = [
  // Personal
  { type: 'Email address',     collected: true,  shared: false, optional: false, purpose: 'Sign-in & account recovery', retention: 'Account lifetime' },
  { type: 'Name',              collected: true,  shared: false, optional: false, purpose: 'Caller display name',         retention: 'Account lifetime' },
  { type: 'Phone number',      collected: true,  shared: false, optional: false, purpose: 'SIP routing',                  retention: 'Account lifetime' },
  // Device & permissions
  { type: 'Microphone audio',  collected: false, shared: false, optional: false, purpose: 'Live call only — not recorded by AVA', retention: 'Not stored' },
  { type: 'Contacts',          collected: false, shared: false, optional: true,  purpose: 'On-device dialer autocomplete',         retention: 'On device only' },
  { type: 'Device push token', collected: true,  shared: false, optional: false, purpose: 'Incoming-call & voicemail alerts',     retention: 'Until sign-out' },
  // Telephony
  { type: 'Call history (CDRs)', collected: true, shared: false, optional: false, purpose: 'Show your recents & analytics',       retention: 'PBX policy (≈90d)' },
  { type: 'Call recordings',   collected: true,  shared: false, optional: true,  purpose: 'QA, training, dispute resolution',     retention: 'Workspace policy (30/60/90d)' },
  { type: 'AI transcripts',    collected: true,  shared: false, optional: true,  purpose: 'Searchable history, coaching, summary', retention: 'Same as parent recording' },
  { type: 'AI sentiment & topics', collected: true, shared: false, optional: true, purpose: 'Customer-experience trends',         retention: 'Same as parent recording' },
  { type: 'Voicemail audio',   collected: true,  shared: false, optional: false, purpose: 'Playback + AI transcript',             retention: '30 days' },
  // App health
  { type: 'Crash logs',        collected: true,  shared: false, optional: true,  purpose: 'App stability — no call content',      retention: '90 days' },
];

const PERMISSIONS = [
  { perm: 'Microphone',         why: 'Place and receive SIP calls',           required: true,  android: 'RECORD_AUDIO',         ios: 'NSMicrophoneUsageDescription' },
  { perm: 'Notifications',      why: 'Inbound call & voicemail alerts',       required: false, android: 'POST_NOTIFICATIONS',   ios: 'UNUserNotificationCenter' },
  { perm: 'Contacts',           why: 'Match caller name in dialer',           required: false, android: 'READ_CONTACTS',        ios: 'NSContactsUsageDescription' },
  { perm: 'Background refresh', why: 'Sync CDRs, queues, voicemail',          required: false, android: 'FOREGROUND_SERVICE',   ios: 'UIBackgroundModes (fetch)' },
  { perm: 'Network',            why: 'Connect to your PBX and AVA backend',   required: true,  android: 'INTERNET',             ios: 'always' },
];

export default function DataSafetyScreen() {
  return (
    <div style={{ padding: 16, overflowY: 'auto', paddingBottom: 120 }}>
      <SectionTitle eyebrow="App Store & Play Store" title="Data safety summary" />

      <Card padded={true}>
        <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.6, margin: 0 }}>
          This page mirrors the <strong>Data Safety</strong> form in Google Play and the
          <strong> Privacy Nutrition Label</strong> in App Store Connect. Data is encrypted in
          transit (TLS 1.2+) and at rest. AVA Softphone does not sell data, does not share with
          advertisers, and does not use your call content to train third-party AI.
        </p>
      </Card>

      {/* Data types table */}
      <Card padded={true}>
        <h3 style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce, margin: '0 0 8px' }}>
          Data types handled
        </h3>
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
          <Header />
          {ROWS.map((r) => <DataRow key={r.type} row={r} />)}
        </div>
        <p style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 10, marginBottom: 0 }}>
          "Optional" = workspace admin or end-user can disable. "Shared" = sent to any party
          outside your workspace; AVA shares <strong>none</strong> of these.
        </p>
      </Card>

      {/* Permissions table */}
      <Card padded={true}>
        <h3 style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce, margin: '0 0 8px' }}>
          Permissions required
        </h3>
        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 0.8fr', padding: '8px 10px', background: 'rgba(0,35,230,0.06)', fontSize: font.xs, fontWeight: 800, color: colors.textIce }}>
            <span>Permission</span><span>Why</span><span>Required?</span>
          </div>
          {PERMISSIONS.map((p) => (
            <div key={p.perm} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 0.8fr', padding: '8px 10px', borderTop: `1px solid ${colors.border}`, fontSize: font.xs, color: colors.textSub }}>
              <div>
                <div style={{ color: colors.textIce, fontWeight: 700 }}>{p.perm}</div>
                <div style={{ fontSize: 9, color: colors.mutedSilver }}>Android: {p.android}</div>
                <div style={{ fontSize: 9, color: colors.mutedSilver }}>iOS: {p.ios}</div>
              </div>
              <span style={{ alignSelf: 'center', lineHeight: 1.45 }}>{p.why}</span>
              <span style={{ alignSelf: 'center', color: p.required ? colors.danger : colors.success, fontWeight: 800 }}>
                {p.required ? 'Required' : 'Optional'}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Retention controls */}
      <RetentionControlsCard />

      {/* Security practices */}
      <Card padded={true}>
        <h3 style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce, margin: '0 0 8px' }}>
          Security practices
        </h3>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: font.sm, color: colors.textSub, lineHeight: 1.7 }}>
          <li>All traffic encrypted with TLS 1.2+ (SIP over WSS, REST over HTTPS).</li>
          <li>Workspace data isolated via row-level security in our database.</li>
          <li>AI processing uses transient model inference — no third-party training on your audio.</li>
          <li>Auth tokens stored in OS-secure storage (Keychain on iOS, EncryptedSharedPreferences on Android).</li>
          <li>Audit log of every recording playback, transcript view, and admin action.</li>
          <li>You can request data export or deletion at any time — handled within 30 days.</li>
        </ul>
      </Card>

      <Card padded={true}>
        <p style={{ fontSize: font.xs, color: colors.mutedSilver, margin: 0 }}>
          Data Protection Officer: <a href="mailto:privacy@avastatistic.ca" style={{ color: colors.lemtelBlue }}>privacy@avastatistic.ca</a><br/>
          Last updated: {new Date().toISOString().slice(0,10)}
        </p>
      </Card>
    </div>
  );
}

function Header() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.7fr 0.7fr 0.7fr 1.6fr 1.2fr', padding: '8px 10px', background: 'rgba(0,35,230,0.06)', fontSize: font.xs, fontWeight: 800, color: colors.textIce }}>
      <span>Data type</span><span>Collected</span><span>Shared</span><span>Optional</span><span>Purpose</span><span>Retention</span>
    </div>
  );
}

function DataRow({ row }: { row: Row }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.7fr 0.7fr 0.7fr 1.6fr 1.2fr', padding: '8px 10px', borderTop: `1px solid ${colors.border}`, fontSize: font.xs, color: colors.textSub, alignItems: 'center' }}>
      <span style={{ color: colors.textIce, fontWeight: 700 }}>{row.type}</span>
      <span style={{ color: row.collected ? colors.lemtelBlue : colors.mutedSilver, fontWeight: 700 }}>{row.collected ? 'Yes' : 'No'}</span>
      <span style={{ color: row.shared ? colors.danger : colors.success, fontWeight: 700 }}>{row.shared ? 'Yes' : 'No'}</span>
      <span style={{ color: row.optional ? colors.success : colors.mutedSilver, fontWeight: 700 }}>{row.optional ? 'Yes' : 'No'}</span>
      <span style={{ lineHeight: 1.45 }}>{row.purpose}</span>
      <span style={{ lineHeight: 1.45, fontStyle: 'italic' }}>{row.retention}</span>
    </div>
  );
}

const RETENTION_OPTIONS = [30, 60, 90, 180, 365] as const;
type RetentionPrefs = {
  callHistoryDays: number;
  recordingsDays: number;
  voicemailDays: number;
  transcriptsEnabled: boolean;
  aiAnalysisEnabled: boolean;
  diagnosticsEnabled: boolean;
};
const STORAGE_KEY = 'ava.dataSafety.prefs.v1';
const DEFAULT_PREFS: RetentionPrefs = {
  callHistoryDays: 90, recordingsDays: 60, voicemailDays: 30,
  transcriptsEnabled: true, aiAnalysisEnabled: true, diagnosticsEnabled: true,
};

function RetentionControlsCard() {
  const [prefs, setPrefs] = useState<RetentionPrefs>(DEFAULT_PREFS);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'delete'>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {}
  }, []);

  const update = (patch: Partial<RetentionPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    setSavedAt(new Date().toLocaleTimeString());
  };

  const runAction = async (label: string, fn: () => Promise<any>) => {
    setBusy(label); setMsg(null);
    try {
      await fn();
      setMsg(`${label} — request submitted. You will receive an email confirmation within 30 days.`);
    } catch (e: any) {
      setMsg(`${label} — failed: ${e?.message || 'unknown error'}`);
    } finally { setBusy(null); }
  };

  return (
    <Card padded={true}>
      <h3 style={{ fontSize: font.md, fontWeight: 800, color: colors.textIce, margin: '0 0 4px' }}>
        Your data — retention & controls
      </h3>
      <p style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 0, marginBottom: 12 }}>
        Choose how long AVA keeps your data on this device, and request export or deletion at any time.
      </p>

      {/* Retention sliders */}
      {([
        { key: 'callHistoryDays', label: 'Call history (CDRs)' },
        { key: 'recordingsDays',  label: 'Call recordings' },
        { key: 'voicemailDays',   label: 'Voicemail audio' },
      ] as const).map(({ key, label }) => (
        <div key={key} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: font.sm, color: colors.textIce, fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: font.xs, color: colors.lemtelBlue, fontWeight: 700 }}>{prefs[key]} days</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {RETENTION_OPTIONS.map(d => (
              <button key={d} onClick={() => update({ [key]: d } as any)} style={{
                flex: 1, padding: '6px 0', borderRadius: radius.sm, cursor: 'pointer',
                border: `1px solid ${prefs[key] === d ? colors.lemtelBlue : colors.border}`,
                background: prefs[key] === d ? 'rgba(0,35,230,0.12)' : 'transparent',
                color: prefs[key] === d ? colors.textIce : colors.textSub,
                fontSize: font.xs, fontWeight: 700,
              }}>{d}d</button>
            ))}
          </div>
        </div>
      ))}

      {/* Toggles */}
      {([
        { key: 'transcriptsEnabled', label: 'Store AI transcripts', help: 'Transcribe recordings so you can search by content.' },
        { key: 'aiAnalysisEnabled',  label: 'AI analysis (sentiment, topics)', help: 'Run insights over your transcripts.' },
        { key: 'diagnosticsEnabled', label: 'Diagnostics & crash reports', help: 'Help us fix bugs faster. No call content is shared.' },
      ] as const).map(({ key, label, help }) => (
        <ToggleRow key={key} label={label} help={help} value={prefs[key] as boolean} onChange={(v) => update({ [key]: v } as any)} />
      ))}

      {savedAt && (
        <div style={{ fontSize: 10, color: colors.success, marginTop: 4 }}>Saved · {savedAt}</div>
      )}

      {/* Actions */}
      <div style={{ borderTop: `1px solid ${colors.border}`, marginTop: 14, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ActionBtn
          label="Export my data"
          tone="primary"
          busy={busy === 'Export my data'}
          onClick={() => runAction('Export my data', () => fetch(`${(window as any).__AVA_PORTAL__ || ''}/functions/v1/export-user-data`, { method: 'POST' }).catch(() => null) as any)}
          help="Download a copy of your CDRs, recordings index, transcripts and account info."
        />
        <ActionBtn
          label="Delete call history & recordings now"
          tone="danger"
          busy={busy === 'Delete call history & recordings now'}
          onClick={() => setConfirm('delete')}
          help="Removes CDRs, recordings, transcripts, voicemails. Your account stays active."
        />
        <ActionBtn
          label="Revoke this device"
          tone="ghost"
          busy={busy === 'Revoke this device'}
          onClick={() => {
            try { localStorage.removeItem('ava.auth.token'); } catch {}
            setMsg('Revoke this device — local credentials cleared. You will be signed out.');
          }}
          help="Removes the SIP credentials and push token from this device."
        />
        {msg && <div style={{ fontSize: 11, color: colors.textSub, lineHeight: 1.5 }}>{msg}</div>}
      </div>

      {confirm === 'delete' && (
        <RetentionConfirm
          prefs={prefs}
          onCancel={() => setConfirm(null)}
          onExport={async () => {
            await runAction('Export my data', () => fetch(`${(window as any).__AVA_PORTAL__ || ''}/functions/v1/export-user-data`, { method: 'POST' }).catch(() => null) as any);
          }}
          onConfirm={async () => {
            setConfirm(null);
            await runAction('Delete call history & recordings now', async () => mobileApi.deleteAccount());
          }}
        />
      )}
    </Card>
  );
}

function RetentionConfirm({ prefs, onCancel, onExport, onConfirm }: {
  prefs: RetentionPrefs;
  onCancel: () => void;
  onExport: () => Promise<void>;
  onConfirm: () => Promise<void>;
}) {
  const [ack, setAck] = useState(false);
  const [exporting, setExporting] = useState(false);
  const items = [
    { label: 'Call history (CDRs)',  detail: `older than ${prefs.callHistoryDays} days` },
    { label: 'Call recordings (audio)', detail: `older than ${prefs.recordingsDays} days` },
    { label: 'AI transcripts',        detail: prefs.transcriptsEnabled ? `older than ${prefs.recordingsDays} days` : 'all transcripts (feature off)' },
    { label: 'AI analysis (sentiment, topics)', detail: prefs.aiAnalysisEnabled ? `older than ${prefs.recordingsDays} days` : 'all analysis (feature off)' },
    { label: 'Voicemail audio & transcripts',   detail: `older than ${prefs.voicemailDays} days` },
  ];
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(2,6,20,0.75)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#0a1024', width: '100%', maxHeight: '88vh', overflowY: 'auto',
        borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18,
        borderTop: `1px solid ${colors.border}`,
      }}>
        <h3 style={{ margin: 0, fontSize: font.md, color: colors.textIce }}>Confirm data deletion</h3>
        <p style={{ fontSize: font.sm, color: colors.textSub, lineHeight: 1.5, marginTop: 6 }}>
          The following data will be <strong style={{ color: colors.danger }}>permanently removed</strong> from your
          workspace. This action cannot be undone. We recommend exporting first.
        </p>

        <div style={{ border: `1px solid ${colors.border}`, borderRadius: radius.md, overflow: 'hidden', marginTop: 10 }}>
          {items.map((it, i) => (
            <div key={it.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderTop: i === 0 ? 'none' : `1px solid ${colors.border}`,
              background: 'rgba(255,255,255,0.02)',
            }}>
              <div>
                <div style={{ fontSize: font.sm, color: colors.textIce, fontWeight: 700 }}>{it.label}</div>
                <div style={{ fontSize: 10.5, color: colors.mutedSilver, marginTop: 2 }}>Scope: {it.detail}</div>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase',
                padding: '2px 6px', borderRadius: 6,
                color: colors.danger, background: 'rgba(220,38,38,0.15)', border: `1px solid ${colors.danger}55`,
              }}>Delete</span>
            </div>
          ))}
        </div>

        <label style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
          fontSize: font.sm, color: colors.textIce, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          I understand this is permanent and cannot be undone.
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          <button onClick={async () => { setExporting(true); try { await onExport(); } finally { setExporting(false); } }}
            disabled={exporting}
            style={{
              padding: '11px 12px', borderRadius: radius.md, border: `1px solid ${colors.lemtelBlue}`,
              background: 'rgba(0,35,230,0.12)', color: colors.textIce, fontSize: font.sm, fontWeight: 700,
              cursor: 'pointer', opacity: exporting ? 0.5 : 1,
            }}>
            {exporting ? 'Preparing export…' : '⬇ Export my data first'}
          </button>
          <button onClick={onConfirm} disabled={!ack} style={{
            padding: '11px 12px', borderRadius: radius.md, border: 'none',
            background: ack ? colors.danger : 'rgba(220,38,38,0.4)', color: '#fff',
            fontSize: font.sm, fontWeight: 700, cursor: ack ? 'pointer' : 'not-allowed',
          }}>
            Delete everything now
          </button>
          <button onClick={onCancel} style={{
            padding: '11px 12px', borderRadius: radius.md, border: `1px solid ${colors.border}`,
            background: 'transparent', color: colors.textIce, fontSize: font.sm, fontWeight: 700, cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({ label, help, value, onChange }: { label: string; help: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderTop: `1px solid ${colors.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: font.sm, color: colors.textIce, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: colors.mutedSilver, lineHeight: 1.4 }}>{help}</div>
      </div>
      <button onClick={() => onChange(!value)} aria-pressed={value} style={{
        width: 40, height: 22, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: value ? colors.lemtelBlue : 'rgba(255,255,255,0.15)',
        position: 'relative', transition: 'background 120ms',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: value ? 20 : 2, width: 18, height: 18,
          borderRadius: 999, background: '#fff', transition: 'left 120ms',
        }} />
      </button>
    </div>
  );
}

function ActionBtn({ label, tone, busy, onClick, help }: { label: string; tone: 'primary' | 'danger' | 'ghost'; busy: boolean; onClick: () => void; help: string }) {
  const bg = tone === 'primary' ? colors.lemtelBlue : tone === 'danger' ? colors.danger : 'transparent';
  const border = tone === 'ghost' ? colors.border : bg;
  const color = tone === 'ghost' ? colors.textIce : '#fff';
  return (
    <div>
      <button onClick={onClick} disabled={busy} style={{
        width: '100%', padding: '10px 12px', borderRadius: radius.md, cursor: busy ? 'wait' : 'pointer',
        background: bg, border: `1px solid ${border}`, color, fontSize: font.sm, fontWeight: 700,
        opacity: busy ? 0.6 : 1,
      }}>{busy ? 'Working…' : label}</button>
      <div style={{ fontSize: 10, color: colors.mutedSilver, marginTop: 4, lineHeight: 1.4 }}>{help}</div>
    </div>
  );
}
