/**
 * MobileSignInDiag — guided manual test for /m sign-in.
 *
 * Runs the same sign-in path the mobile AuthScreen uses (email or extension),
 * then exercises the live data endpoints (Voicemail, Recordings, SMS) with the
 * returned access token. Each step is reported with status + raw HTTP code so
 * failures are unambiguous.
 *
 * Web-only diagnostic widget — does not ship inside the native build.
 */
import { useState } from 'react';

const SUPABASE_URL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

type Mode = 'email' | 'extension';
type Status = 'pending' | 'running' | 'ok' | 'fail';
type Step = { id: string; label: string; status: Status; code?: string; message?: string };

const mkSteps = (mode: Mode): Step[] => [
  { id: 'auth', label: mode === 'email' ? 'Supabase Auth — /auth/v1/token' : 'Edge function — extension-signin', status: 'pending' },
  { id: 'voicemail', label: 'Live data — mobile-voicemails', status: 'pending' },
  { id: 'recordings', label: 'Live data — mobile-recordings', status: 'pending' },
  { id: 'sms', label: 'Live data — mobile-sms', status: 'pending' },
];

async function callJSON(url: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e: any) {
    return { ok: false, status: 0, code: 'fetch_failed', body: e?.message || 'network error' } as const;
  }
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return {
    ok: res.ok,
    status: res.status,
    code: json?.error || (res.ok ? 'ok' : `http_${res.status}`),
    body: json ?? text.slice(0, 300),
  } as const;
}

export default function MobileSignInDiag() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [extension, setExtension] = useState('');
  const [sipDomain, setSipDomain] = useState('lemtel.lemtel.tel');
  const [steps, setSteps] = useState<Step[]>(mkSteps('email'));
  const [running, setRunning] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Step>) =>
    setSteps((s) => s.map((st) => (st.id === id ? { ...st, ...patch } : st)));

  const run = async () => {
    setRunning(true);
    setToken(null);
    setSteps(mkSteps(mode));

    // Step 1 — sign in
    update('auth', { status: 'running' });
    let accessToken: string | null = null;
    if (mode === 'email') {
      const r = await callJSON(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      accessToken = (r.body as any)?.access_token || null;
      update('auth', {
        status: r.ok && accessToken ? 'ok' : 'fail',
        code: r.code,
        message: r.ok ? `user ${(r.body as any)?.user?.email}` : (r.body as any)?.error_description || (r.body as any)?.msg || String(r.body).slice(0, 160),
      });
    } else {
      const r = await callJSON(`${SUPABASE_URL}/functions/v1/extension-signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ extension: extension.trim(), password, sip_domain: sipDomain.trim() || undefined, platform: 'mobile' }),
      });
      accessToken = (r.body as any)?.access_token || null;
      update('auth', {
        status: r.ok && accessToken ? 'ok' : 'fail',
        code: r.code,
        message: r.ok ? `ext ${(r.body as any)?.extension} @ ${(r.body as any)?.sip_domain}` : (r.body as any)?.detail || String(r.body).slice(0, 160),
      });
    }
    setToken(accessToken);
    if (!accessToken) { setRunning(false); return; }

    // Steps 2-4 — live data endpoints
    const liveCalls: { id: string; path: string }[] = [
      { id: 'voicemail', path: '/functions/v1/mobile-voicemails' },
      { id: 'recordings', path: '/functions/v1/mobile-recordings' },
      { id: 'sms', path: '/functions/v1/mobile-sms' },
    ];
    for (const c of liveCalls) {
      update(c.id, { status: 'running' });
      const r = await callJSON(`${SUPABASE_URL}${c.path}`, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${accessToken}` },
      });
      const count = Array.isArray((r.body as any)?.items) ? (r.body as any).items.length
        : Array.isArray(r.body) ? (r.body as any).length : undefined;
      update(c.id, {
        status: r.ok ? 'ok' : 'fail',
        code: r.code,
        message: r.ok ? (count !== undefined ? `${count} items` : 'ok') : String(r.body).slice(0, 160),
      });
    }
    setRunning(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={triggerStyle}>
        🩺 Diag
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 13, color: '#E8EEFB' }}>Mobile sign-in diagnostic</strong>
        <button onClick={() => setOpen(false)} style={closeStyle}>×</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {(['email', 'extension'] as Mode[]).map((m) => (
          <button key={m} onClick={() => { setMode(m); setSteps(mkSteps(m)); }}
            style={{ ...tabStyle, ...(mode === m ? tabActiveStyle : null) }}>
            {m}
          </button>
        ))}
      </div>

      {mode === 'email' ? (
        <>
          <Input label="Email" value={email} onChange={setEmail} type="email" />
          <Input label="Password" value={password} onChange={setPassword} type="password" />
        </>
      ) : (
        <>
          <Input label="Extension" value={extension} onChange={setExtension} />
          <Input label="SIP Domain" value={sipDomain} onChange={setSipDomain} />
          <Input label="SIP Password" value={password} onChange={setPassword} type="password" />
        </>
      )}

      <button onClick={run} disabled={running} style={{ ...runBtnStyle, opacity: running ? 0.6 : 1 }}>
        {running ? 'Running…' : 'Run guided test'}
      </button>

      <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map((s) => (
          <li key={s.id} style={stepRowStyle(s.status)}>
            <span style={{ width: 16 }}>{icon(s.status)}</span>
            <span style={{ flex: 1 }}>{s.label}</span>
            {s.code && <span style={codeChipStyle}>{s.code}</span>}
            {s.message && <span style={{ fontSize: 10, color: 'rgba(232,238,251,0.6)', marginLeft: 6 }}>{s.message}</span>}
          </li>
        ))}
      </ol>

      {token && (
        <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(232,238,251,0.5)' }}>
          token: <code>{token.slice(0, 16)}…{token.slice(-8)}</code>
        </div>
      )}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
      <span style={{ fontSize: 10, color: 'rgba(232,238,251,0.6)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#E8EEFB', padding: '8px 10px', fontSize: 12, outline: 'none' }} />
    </label>
  );
}

function icon(s: Status) {
  if (s === 'ok') return '✅';
  if (s === 'fail') return '❌';
  if (s === 'running') return '⏳';
  return '·';
}

const triggerStyle: React.CSSProperties = {
  position: 'fixed', right: 12, bottom: 12, zIndex: 9999,
  padding: '8px 12px', borderRadius: 999,
  background: 'rgba(11,21,48,0.92)', color: '#E8EEFB',
  border: '1px solid rgba(255,255,255,0.18)', fontSize: 12, cursor: 'pointer',
  boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
};
const panelStyle: React.CSSProperties = {
  position: 'fixed', right: 12, bottom: 12, zIndex: 9999,
  width: 360, maxHeight: '80vh', overflow: 'auto',
  padding: 14, borderRadius: 14,
  background: 'rgba(10,20,41,0.96)', backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.12)', color: '#E8EEFB',
  boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
  fontFamily: 'Inter, system-ui, sans-serif',
};
const closeStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#E8EEFB', fontSize: 20, cursor: 'pointer', lineHeight: 1 };
const tabStyle: React.CSSProperties = { flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 11, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#E8EEFB', cursor: 'pointer', textTransform: 'capitalize' };
const tabActiveStyle: React.CSSProperties = { background: 'rgba(11,181,214,0.18)', border: '1px solid rgba(11,181,214,0.45)' };
const runBtnStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg,#FFD700,#0BB5D6)', color: '#0A1429', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer', marginTop: 4 };
const codeChipStyle: React.CSSProperties = { fontFamily: 'Fira Code, monospace', fontSize: 10, padding: '1px 6px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' };
const stepRowStyle = (s: Status): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 8, fontSize: 11,
  padding: '6px 8px', borderRadius: 8,
  background: s === 'fail' ? 'rgba(239,68,68,0.12)' : s === 'ok' ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.04)',
  border: `1px solid ${s === 'fail' ? 'rgba(239,68,68,0.3)' : s === 'ok' ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)'}`,
});
