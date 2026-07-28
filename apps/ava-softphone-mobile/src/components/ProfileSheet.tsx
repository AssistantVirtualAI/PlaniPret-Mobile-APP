import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, LogOut, KeyRound, Camera, Check, Bell } from 'lucide-react';
import RingSettingsSheet from './RingSettingsSheet';
import { colors, font, radius, gradients } from '../lib/theme';
import type { Creds } from '../lib/creds';

const SUPABASE_URL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

type Status = 'available' | 'busy' | 'on_call' | 'meeting' | 'lunch' | 'break' | 'dnd' | 'away' | 'out_of_office' | 'offline';

const STATUS_OPTIONS: { id: Status; label: string; color: string }[] = [
  { id: 'available',     label: 'Available',       color: '#22c55e' },
  { id: 'busy',          label: 'Busy',            color: '#f59e0b' },
  { id: 'on_call',       label: 'On a call',       color: '#3b82f6' },
  { id: 'meeting',       label: 'In a meeting',    color: '#8b5cf6' },
  { id: 'lunch',         label: 'Lunch',           color: '#f97316' },
  { id: 'break',         label: 'On a break',      color: '#14b8a6' },
  { id: 'dnd',           label: 'Do not disturb',  color: '#ef4444' },
  { id: 'away',          label: 'Away',            color: '#94a3b8' },
  { id: 'out_of_office', label: 'Out of office',   color: '#6366f1' },
  { id: 'offline',       label: 'Appear offline',  color: '#64748b' },
];

async function rest(path: string, init: RequestInit & { token?: string }) {
  const headers = new Headers(init.headers as any);
  headers.set('apikey', SUPABASE_ANON);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  headers.set('Content-Type', 'application/json');
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
}

export default function ProfileSheet({
  creds, onClose, onSignOut, onCredsUpdate,
}: {
  creds: Creds;
  onClose: () => void;
  onSignOut: () => void;
  onCredsUpdate?: (c: Creds) => void;
}) {
  const [status, setStatus] = useState<Status>('available');
  const [savingStatus, setSavingStatus] = useState<Status | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [ringOpen, setRingOpen] = useState(false);
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwError, setPwError] = useState(false);

  // Load current status + avatar
  useEffect(() => {
    if (!creds.accessToken || !creds.userId) return;
    rest(`/rest/v1/user_presence?user_id=eq.${creds.userId}&select=status`, {
      token: creds.accessToken,
    }).then(async (r) => {
      if (!r.ok) return;
      const rows = await r.json().catch(() => []);
      const s = rows?.[0]?.status as Status | undefined;
      if (s) setStatus(s);
    }).catch(() => {});

    // Try signed url for avatar
    rest(`/storage/v1/object/sign/avatars/${creds.userId}/avatar.jpg?expiresIn=3600`, {
      token: creds.accessToken, method: 'POST', body: JSON.stringify({}),
    }).then(async (r) => {
      if (!r.ok) return;
      const d = await r.json().catch(() => null);
      if (d?.signedURL) setAvatarUrl(`${SUPABASE_URL}/storage/v1${d.signedURL}`);
    }).catch(() => {});
  }, [creds.accessToken, creds.userId]);

  const changeStatus = async (next: Status) => {
    if (!creds.accessToken || !creds.userId) return;
    setSavingStatus(next);
    try {
      // Upsert user_presence
      const body = {
        user_id: creds.userId,
        organization_id: creds.organizationId,
        extension: creds.extension || null,
        status: next,
        platform: 'mobile',
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const r = await rest(`/rest/v1/user_presence?on_conflict=user_id`, {
        token: creds.accessToken, method: 'POST',
        body: JSON.stringify(body),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } as any,
      });
      if (r.ok) setStatus(next);
    } catch {}
    setSavingStatus(null);
  };

  const onAvatarFile = async (file: File) => {
    if (!creds.accessToken || !creds.userId) return;
    setUploading(true);
    try {
      const path = `${creds.userId}/avatar.jpg`;
      await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          apikey: SUPABASE_ANON,
          'Content-Type': file.type || 'image/jpeg',
          'x-upsert': 'true',
        },
        body: file,
      });
      // Re-sign
      const r = await rest(`/storage/v1/object/sign/avatars/${path}?expiresIn=3600`, {
        token: creds.accessToken, method: 'POST', body: JSON.stringify({}),
      });
      const d = await r.json().catch(() => null);
      if (d?.signedURL) setAvatarUrl(`${SUPABASE_URL}/storage/v1${d.signedURL}`);
    } catch {}
    setUploading(false);
  };

  const updatePassword = async () => {
    setPwMsg(null); setPwError(false);
    if (pwNew.length < 8) { setPwMsg('Password must be at least 8 characters.'); setPwError(true); return; }
    if (pwNew !== pwConfirm) { setPwMsg('Passwords do not match.'); setPwError(true); return; }
    if (!creds.accessToken) { setPwMsg('Not signed in.'); setPwError(true); return; }
    setPwBusy(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT',
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: pwNew }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        throw new Error(d?.msg || d?.error_description || `HTTP ${r.status}`);
      }
      setPwMsg('Password updated.'); setPwError(false);
      setPwNew(''); setPwConfirm('');
      setTimeout(() => { setPwOpen(false); setPwMsg(null); }, 1200);
    } catch (e: any) {
      setPwMsg(e?.message || 'Could not update password.'); setPwError(true);
    }
    setPwBusy(false);
  };

  const sendResetEmail = async () => {
    if (!creds.email) return;
    setPwBusy(true); setPwMsg(null); setPwError(false);
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email }),
      });
      if (!r.ok) throw new Error();
      setPwMsg('Reset email sent — check your inbox.');
    } catch { setPwMsg('Could not send reset email.'); setPwError(true); }
    setPwBusy(false);
  };

  const initials = (creds.displayName || creds.email || 'U').split(/[\s@]/)[0].slice(0, 2).toUpperCase();
  const currentStatusColor = STATUS_OPTIONS.find((s) => s.id === status)?.color || '#94a3b8';

  return createPortal((
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(7,15,38,0.55)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          maxHeight: '92vh', overflowY: 'auto',
          background: gradients.app, color: colors.textIce,
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          border: `1px solid ${colors.border}`,
          padding: '14px 18px calc(20px + var(--safe-bottom))',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: font.md, fontWeight: 800 }}>My profile</span>
          <button onClick={onClose} style={btnIcon}><X size={20} /></button>
        </div>

        {/* Avatar + identity */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '14px 0 18px' }}>
          <label style={{ position: 'relative', cursor: 'pointer' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: avatarUrl ? `center/cover url(${avatarUrl})` : gradients.ai,
              display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 26,
              border: `3px solid ${currentStatusColor}`,
            }}>
              {!avatarUrl && initials}
            </div>
            <div style={{
              position: 'absolute', bottom: -2, right: -2, width: 26, height: 26,
              borderRadius: '50%', background: colors.lemtelBlue, color: '#fff',
              display: 'grid', placeItems: 'center', border: '2px solid #fff',
            }}>
              <Camera size={14} />
            </div>
            <input
              type="file" accept="image/*" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onAvatarFile(f); }}
            />
          </label>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: font.md, fontWeight: 800 }}>
              {creds.displayName || creds.email}
            </div>
            <div style={{ fontSize: font.xs, color: colors.mutedSilver, marginTop: 2 }}>
              {creds.email}
            </div>
            <div style={{ fontSize: 11, color: colors.signalGold, marginTop: 4, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Ext {creds.extension || '—'} · {creds.sipDomain || '—'}
            </div>
          </div>
        </div>
        {uploading && <div style={{ fontSize: 11, color: colors.mutedSilver, marginBottom: 8 }}>Uploading photo…</div>}

        {/* Status selector */}
        <SectionLabel>Status</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {STATUS_OPTIONS.map((s) => {
            const active = status === s.id;
            return (
              <button key={s.id} onClick={() => changeStatus(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: radius.lg,
                  background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? s.color + '88' : colors.border}`,
                  color: colors.textIce, cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, boxShadow: `0 0 10px ${s.color}88` }} />
                <span style={{ flex: 1, fontSize: font.sm, fontWeight: 600 }}>{s.label}</span>
                {savingStatus === s.id ? <span style={{ fontSize: 10, color: colors.mutedSilver }}>…</span>
                  : active ? <Check size={16} color={s.color} /> : null}
              </button>
            );
          })}
        </div>

        {/* Account */}
        <SectionLabel>Account</SectionLabel>
        <button onClick={() => { setPwOpen((v) => !v); setPwMsg(null); }} style={rowBtn}>
          <KeyRound size={18} />
          <span style={{ flex: 1, textAlign: 'left' }}>Change password</span>
          <span style={{ fontSize: 11, color: colors.mutedSilver }}>{pwOpen ? '▲' : '▼'}</span>
        </button>
        {pwOpen && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: 12, marginTop: 6, borderRadius: radius.lg,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`,
          }}>
            <input type="password" placeholder="New password (min 8 characters)"
              value={pwNew} onChange={(e) => setPwNew(e.target.value)} style={pwInput} />
            <input type="password" placeholder="Confirm new password"
              value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} style={pwInput} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={updatePassword} disabled={pwBusy || !pwNew || !pwConfirm}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: radius.md, border: 'none',
                  background: gradients.call, color: '#fff', fontSize: 13, fontWeight: 800,
                  cursor: pwBusy ? 'default' : 'pointer', opacity: pwBusy ? 0.7 : 1,
                }}>{pwBusy ? 'Updating…' : 'Update password'}</button>
              <button onClick={sendResetEmail} disabled={pwBusy} style={{
                padding: '10px 12px', borderRadius: radius.md,
                background: 'transparent', border: `1px solid ${colors.border}`,
                color: colors.textIce, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Email link</button>
            </div>
            {pwMsg && (
              <div style={{ fontSize: 11, color: pwError ? '#ef4444' : '#22c55e', padding: '2px 2px 0' }}>
                {pwMsg}
              </div>
            )}
          </div>
        )}
        <button onClick={() => setRingOpen(true)} style={rowBtn}>
          <Bell size={18} />
          <span style={{ flex: 1, textAlign: 'left' }}>Ring & vibration</span>
          <span style={{ fontSize: 11, color: colors.mutedSilver }}>›</span>
        </button>
        <button onClick={onSignOut} style={{ ...rowBtn, color: '#ef4444', marginTop: 8 }}>
          <LogOut size={18} />
          <span style={{ flex: 1, textAlign: 'left' }}>Sign out</span>
        </button>
        <RingSettingsSheet open={ringOpen} onClose={() => setRingOpen(false)} />

      </div>
    </div>
  ), document.body);
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: colors.signalGold, textTransform: 'uppercase', margin: '18px 4px 8px' }}>
      {children}
    </div>
  );
}

const btnIcon: React.CSSProperties = {
  background: 'transparent', border: 'none', color: colors.textIce, cursor: 'pointer',
  padding: 6, borderRadius: 999,
};

const rowBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
  padding: '12px 14px', borderRadius: radius.lg,
  background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.border}`,
  color: colors.textIce, cursor: 'pointer', fontSize: 14, fontWeight: 600,
};

const pwInput: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10,
  background: 'rgba(255,255,255,0.06)', border: `1px solid ${colors.border}`,
  color: colors.textIce, fontSize: 13, outline: 'none',
};
