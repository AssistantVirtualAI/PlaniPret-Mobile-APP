import React, { useEffect, useState } from 'react';
import type { Creds } from '../lib/creds';
import { Store } from '../lib/creds';
import { colors } from '../lib/theme';
import NativeStatePanel from '../components/sip/NativeStatePanel';

export default function SipConfigScreen({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Partial<Creds>;
  onSaved: (c: Creds) => void;
  onCancel?: () => void;
}) {
  const [extension, setExtension] = useState(initial?.extension || '');
  const [displayName, setDisplayName] = useState(initial?.displayName || '');
  const [sipDomain, setSipDomain] = useState(initial?.sipDomain || '');
  const [password, setPassword] = useState('');
  const [wssUrl, setWssUrl] = useState(initial?.wssUrl || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load any previously saved config so the user can re-edit.
  useEffect(() => {
    Store.get().then((c) => {
      if (!c) return;
      if (!initial?.extension && c.extension) setExtension(c.extension);
      if (!initial?.displayName && c.displayName) setDisplayName(c.displayName);
      if (!initial?.sipDomain && c.sipDomain) setSipDomain(c.sipDomain);
      if (!initial?.wssUrl && c.wssUrl) setWssUrl(c.wssUrl);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!extension || !sipDomain || !wssUrl || !password) {
      setError("L'extension, le domaine, le mot de passe et l'URL WSS sont requis.");
      return;
    }
    if (!/^wss?:\/\//i.test(wssUrl)) {
      setError("L'URL WSS doit commencer par wss:// ou ws://");
      return;
    }
    setBusy(true);
    try {
      const creds: Creds = {
        email: extension + '@' + sipDomain,
        extension,
        displayName: displayName || extension,
        sipDomain,
        wssUrl,
        // Stored alongside creds so softphone auto-connects on next launch.
        accessToken: password,
      };
      await Store.set(creds);
      onSaved(creds);
    } catch (err: any) {
      setError(err?.message || "Échec de l'enregistrement de la configuration");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrap}>
      <div style={{ flex: 1, padding: '32px 24px', overflowY: 'auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px' }}>Configuration SIP manuelle</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted, #8a93a6)', margin: '0 0 24px' }}>
          Saisissez vos identifiants SIP. Ils sont enregistrés sur cet appareil et rechargés au prochain lancement.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Extension" value={extension} onChange={setExtension} placeholder="300" autoFocus />
          <Field label="Nom affiché" value={displayName} onChange={setDisplayName} placeholder="Jean Tremblay" />
          <Field label="Domaine SIP" value={sipDomain} onChange={setSipDomain} placeholder="sip.example.com" />
          <Field label="Mot de passe" value={password} onChange={setPassword} placeholder="••••••••" type="password" />
          <Field label="URL WSS" value={wssUrl} onChange={setWssUrl} placeholder="wss://sip.example.com:7443" />

          {error && (
            <div role="alert" style={errBox}>{error}</div>
          )}

          <button type="submit" disabled={busy} style={primaryBtn}>
            {busy ? 'Enregistrement…' : 'Enregistrer et connecter'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} style={ghostBtn}>Annuler</button>
          )}
        </form>

        <NativeStatePanel />
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = 'text', autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted, #8a93a6)' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={inputStyle}
      />
    </label>
  );
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100vh',
  background: 'var(--bg, #06101f)', color: 'var(--text, #e6edf7)',
  paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)',
};
const inputStyle: React.CSSProperties = {
  height: 44, padding: '0 12px', borderRadius: 10,
  background: colors.graphite, color: colors.textIce,
  border: `1px solid ${colors.border}`, fontSize: 15, outline: 'none',
};
const primaryBtn: React.CSSProperties = {
  height: 48, marginTop: 8, borderRadius: 12, border: 'none',
  background: colors.lemtelBlue, color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
};
const ghostBtn: React.CSSProperties = {
  height: 44, borderRadius: 12, border: `1px solid ${colors.border}`,
  background: 'transparent', color: colors.textSub, fontSize: 14, cursor: 'pointer',
};
const errBox: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10,
  background: `${colors.danger}1f`, color: colors.danger,
  border: `1px solid ${colors.danger}4d`, fontSize: 13,
};
