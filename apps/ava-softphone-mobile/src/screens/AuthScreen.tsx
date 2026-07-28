import React, { useEffect, useState } from 'react';
import type { Creds } from '../lib/creds';
import SipConfigScreen from './SipConfigScreen';
import { txStatic as tx } from '../lib/i18n';

type Mode = 'extension' | 'email';
type Screen = 'login' | 'sip' | 'forgot';
type ForgotStep = 'form' | 'confirm' | 'sent';
type Accent = 'gold-cyan' | 'cyan-gold';

const ACCENT_KEY = 'lemtel-auth-accent';
const loadAccent = (): Accent => {
  try {
    const v = localStorage.getItem(ACCENT_KEY);
    return v === 'cyan-gold' ? 'cyan-gold' : 'gold-cyan';
  } catch { return 'gold-cyan'; }
};
const saveAccent = (a: Accent) => { try { localStorage.setItem(ACCENT_KEY, a); } catch {} };
const accentGradient = (a: Accent) =>
  a === 'cyan-gold'
    ? 'linear-gradient(135deg, #0BB5D6 0%, #FFD700 100%)'
    : 'linear-gradient(135deg, #FFD700 0%, #0BB5D6 100%)';

// Desktop-parity palette
const C = {
  bg: '#0A1429',
  bgCard: 'rgba(16,26,48,0.78)',
  border: 'rgba(255,255,255,0.08)',
  text: '#E8EEFB',
  textIce: '#F4F8FF',
  textSub: 'rgba(232,238,251,0.62)',
  textDim: 'rgba(232,238,251,0.42)',
  gold: '#FFD700',
  avaCyan: '#0BB5D6',
  green: '#22C55E',
  red: '#EF4444',
};

const SUPABASE_URL = 'https://gejxisrqtvxavbrfcoxz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlanhpc3JxdHZ4YXZicmZjb3h6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1MDMxNzQsImV4cCI6MjA3NzA3OTE3NH0.kaO-GslE99OCNrZ4_AMnbzGqya2azqz_UMZR34zZvvo';

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

type AuthStep = 'network' | 'edge-function' | 'supabase-auth' | 'token' | 'validation';
type AuthFailure = { step: AuthStep; code: string; message: string; detail?: string };

class AuthError extends Error {
  step: AuthStep; code: string; detail?: string;
  constructor(f: AuthFailure) { super(f.message); this.step = f.step; this.code = f.code; this.detail = f.detail; }
}

const mapAuthError = (raw: string): string => {
  const m = (raw || '').toLowerCase();
  if (m.includes('invalid_credentials') || m.includes('invalid login')) return tx('Adresse e-mail ou mot de passe incorrect.', 'Incorrect email or password.');
  if (m.includes('extension_not_found')) return tx('Extension introuvable.', 'Extension not found.');
  if (m.includes('app_access_disabled') || m.includes('mobile_access_disabled')) return tx("L'accès mobile n'a pas été activé pour cette extension. Contactez votre administrateur.", 'Mobile access has not been enabled for this extension. Contact your administrator.');
  if (m.includes('ambiguous_extension')) return tx('Plusieurs extensions correspondent — veuillez saisir le domaine SIP.', 'Multiple extensions match — please enter the SIP domain.');
  if (m.includes('rate') && m.includes('limit')) return tx('Trop de tentatives. Veuillez patienter avant de réessayer.', 'Too many attempts. Please wait before trying again.');
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('load failed')) return tx('Erreur réseau — vérifiez votre connexion.', 'Network error — check your connection.');
  if (m.includes('session') || m.includes('jwt')) return tx('Votre session a expiré. Veuillez vous reconnecter.', 'Your session has expired. Please sign in again.');
  return raw || tx("Une erreur est survenue. Veuillez réessayer.", 'An error occurred. Please try again.');
};

export default function AuthScreen({ onAuthenticated }: { onAuthenticated: (c: Creds) => void }) {
  const [screen, setScreen] = useState<Screen>('login');
  const [mode, setMode] = useState<Mode>('extension');
  const [extension, setExtension] = useState('');
  const [sipDomain, setSipDomain] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [portalUrl, setPortalUrl] = useState('https://avastatistic.ca');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [accent, setAccent] = useState<Accent>(loadAccent);

  // Persist + cascade accent gradient as a CSS variable.
  useEffect(() => {
    saveAccent(accent);
    document.documentElement.style.setProperty('--auth-accent', accentGradient(accent));
  }, [accent]);

  if (screen === 'sip') {
    return <SipConfigScreen onSaved={onAuthenticated} onCancel={() => setScreen('login')} />;
  }
  if (screen === 'forgot') {
    return <ForgotPasswordScreen initialEmail={email} accent={accent} onBack={() => setScreen('login')} />;
  }

  const base = portalUrl.replace(/\/$/, '');

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (mode === 'email') {
      if (!email.trim()) errs.email = 'Email is required.';
      else if (!isEmail(email)) errs.email = 'Enter a valid email address.';
      if (!password) errs.password = 'Password is required.';
      else if (password.length < 6) errs.password = 'Password must be at least 6 characters.';
    } else {
      if (!extension.trim()) errs.extension = 'Extension is required.';
      if (!password) errs.password = 'SIP password is required.';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submitEmail = async () => {
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
        body: JSON.stringify({ email: email.trim(), password }),
      });
    } catch (e: any) {
      throw new AuthError({ step: 'network', code: 'fetch_failed', message: 'Cannot reach Supabase Auth', detail: e?.message || String(e) });
    }
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      throw new AuthError({
        step: 'supabase-auth',
        code: data?.error_code || data?.error || `http_${res.status}`,
        message: data?.error_description || data?.msg || 'Sign-in rejected by Supabase Auth',
        detail: JSON.stringify(data).slice(0, 300),
      });
    }
    if (!data?.access_token) {
      throw new AuthError({ step: 'token', code: 'no_token', message: 'Auth succeeded but no access_token returned' });
    }
    // Resolve organizationId via user_roles so downstream screens (recordings,
    // CDR realtime, debug) don't fall over with "No organizationId in stored credentials".
    let organizationId: string | undefined;
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${data.user.id}&select=organization_id&limit=1`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${data.access_token}` } },
      );
      const rows = await r.json().catch(() => []);
      organizationId = rows?.[0]?.organization_id || undefined;
    } catch { /* non-fatal — ensureStoredOrganizationId will retry later */ }

    onAuthenticated({
      portalUrl,
      email: data?.user?.email || email.trim(),
      extension: '',
      userId: data?.user?.id,
      accessToken: data?.access_token,
      refreshToken: data?.refresh_token,
      organizationId,
    });
  };


  const submitExtension = async () => {
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/extension-signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({
          extension: extension.trim(),
          password,
          sip_domain: sipDomain.trim() || undefined,
          platform: 'mobile',
        }),
      });
    } catch (e: any) {
      throw new AuthError({ step: 'network', code: 'fetch_failed', message: 'Cannot reach extension-signin edge function', detail: e?.message || String(e) });
    }
    const data = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      throw new AuthError({
        step: 'edge-function',
        code: data?.error || `http_${res.status}`,
        message: data?.detail || data?.hint || 'extension-signin returned an error',
        detail: JSON.stringify(data).slice(0, 300),
      });
    }
    if (!data?.access_token) {
      throw new AuthError({ step: 'token', code: 'no_token', message: 'Edge function returned no access_token', detail: JSON.stringify(data).slice(0, 300) });
    }
    onAuthenticated({
      portalUrl,
      email: data.email,
      extension: data.extension,
      displayName: data.display_name,
      sipDomain: data.sip_domain,
      wssUrl: data.wss_url,
      sipPassword: data.sip_password || data.password || password,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      userId: data.user_id,
      organizationId: data.organization_id,
      organizationName: data.organization_name,
      fusionpbxDomainUuid: data.fusionpbx_domain_uuid,
      domainUuid: data.fusionpbx_domain_uuid,
      role: data.role,
      dataScope: data.data_scope,
      permissions: data.permissions,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setFailure(null);
    if (!validate()) { setFailure({ step: 'validation', code: 'invalid_input', message: tx('Veuillez corriger les champs en évidence.', 'Please correct the highlighted fields.') }); return; }
    setBusy(true);
    try {
      if (mode === 'email') await submitEmail();
      else await submitExtension();
    } catch (e: any) {
      if (e instanceof AuthError) {
        setFailure({ step: e.step, code: e.code, message: e.message, detail: e.detail });
        setError(mapAuthError(e.code + ' ' + e.message));
      } else {
        setFailure({ step: 'network', code: 'unknown', message: e?.message || tx('Erreur inconnue', 'Unknown error') });
        setError(mapAuthError(e?.message));
      }
      // eslint-disable-next-line no-console
      console.error('[AuthScreen] sign-in failed', { step: (e as any)?.step, code: (e as any)?.code, message: e?.message, detail: (e as any)?.detail });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = mode === 'email' ? !!email && !!password : !!extension && !!password;

  return (
    <div style={wrap}>
      <AccentSwitch accent={accent} onChange={setAccent} />
      <GoldGlow />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', position: 'relative', zIndex: 1 }}>
        <Brand />

        <div style={cardStyle}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ModeToggle mode={mode} accent={accent} onChange={(m) => { setMode(m); setError(null); setFieldErrors({}); }} />


            <Field label={tx('URL du portail', 'Portal URL')} value={portalUrl} onChange={setPortalUrl} type="url" />
            {mode === 'email' ? (
              <>
                <Field label={tx('Adresse e-mail', 'Email address')} value={email} onChange={(v) => { setEmail(v); setFieldErrors((f) => ({ ...f, email: '' })); }} type="email" placeholder={tx('vous@entreprise.com', 'you@company.com')} autoFocus error={fieldErrors.email} />
                <Field label={tx('Mot de passe', 'Password')} value={password} onChange={(v) => { setPassword(v); setFieldErrors((f) => ({ ...f, password: '' })); }} type="password" placeholder="••••••••" error={fieldErrors.password} />
              </>
            ) : (
              <>
                <Field label={tx('Extension', 'Extension')} value={extension} onChange={(v) => { setExtension(v); setFieldErrors((f) => ({ ...f, extension: '' })); }} placeholder={tx('ex. 1001', 'e.g. 1001')} autoFocus error={fieldErrors.extension} />
                <Field label={tx('Domaine SIP', 'SIP domain')} value={sipDomain} onChange={setSipDomain} placeholder="sip.example.com" />
                <Field label={tx('Mot de passe SIP', 'SIP password')} value={password} onChange={(v) => { setPassword(v); setFieldErrors((f) => ({ ...f, password: '' })); }} type="password" placeholder="••••••••" error={fieldErrors.password} />
              </>
            )}

            {error && <ErrorBanner failure={failure}>{error}</ErrorBanner>}

            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="lemtel-btn-primary"
              style={{ marginTop: 6, height: 50, borderRadius: 14, fontSize: 14, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {busy && <Spinner />}
              {busy ? tx('Connexion…', 'Signing in…') : tx('Se connecter', 'Sign in')}
            </button>

            {mode === 'email' && (
              <button
                type="button"
                onClick={() => setScreen('forgot')}
                style={ghostLink}
              >
                {tx('Mot de passe oublié ?', 'Forgot password?')}
              </button>
            )}

            <button
              type="button"
              onClick={() => setScreen('sip')}
              style={ghostBtn}
            >
              {tx('Configuration SIP manuelle', 'Manual SIP configuration')}
            </button>

            <div style={{ fontSize: 10.5, color: C.textDim, lineHeight: 1.5, textAlign: 'center', marginTop: 2 }}>
              {mode === 'extension'
                ? tx("Utilisez le même mot de passe SIP défini sur votre extension dans le portail (ou dans FusionPBX). Si vous n'en avez pas, demandez à votre administrateur de le configurer.", 'Use the same SIP password set on your extension in the portal (or in FusionPBX). If you don\u2019t have one, ask your administrator to configure it.')
                : tx("Connectez-vous avec l'adresse e-mail et le mot de passe associés à votre compte du portail Lemtel.", 'Sign in with the email address and password tied to your Lemtel portal account.')}
            </div>
          </form>
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* ====== Forgot password screen ====== */
const RESEND_COOLDOWN_SECONDS = 30;

function ForgotPasswordScreen({ initialEmail, accent, onBack }: { initialEmail: string; accent: Accent; onBack: () => void }) {
  const [step, setStep] = useState<ForgotStep>('form');
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<string>('');
  const [cooldown, setCooldown] = useState(0);
  const [resentInfo, setResentInfo] = useState<string | null>(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  const goConfirm = () => {
    setError(null);
    if (!email.trim()) { setFieldErr(tx("L'adresse e-mail est requise.", 'Email address is required.')); return; }
    if (!isEmail(email)) { setFieldErr(tx('Saisissez une adresse e-mail valide.', 'Enter a valid email address.')); return; }
    setFieldErr('');
    setStep('confirm');
  };

  const sendReset = async (opts?: { resend?: boolean }) => {
    if (busy || cooldown > 0) return; // multi-click guard
    setBusy(true); setError(null); setResentInfo(null);
    try {
      const redirectTo = 'https://avastatistic.ca/reset-password';
      const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify({ email: email.trim(), redirect_to: redirectTo }),
      });
      if (!res.ok) {
        let detail: any = null; try { detail = await res.json(); } catch {}
        throw new Error(detail?.msg || detail?.error || `HTTP ${res.status}`);
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (opts?.resend) setResentInfo(tx('E-mail de réinitialisation renvoyé.', 'Reset email resent.'));
      setStep('sent');
    } catch (e: any) {
      setError(mapAuthError(e?.message));
      if (!opts?.resend) setStep('form');
    } finally { setBusy(false); }
  };

  return (
    <div style={wrap}>
      <AccentSwitch accent={accent} readOnly />
      <GoldGlow />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px', position: 'relative', zIndex: 1 }}>
        <Brand />
        <div style={cardStyle}>
          {step === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h2 style={headingStyle}>{tx('Réinitialiser le mot de passe', 'Reset password')}</h2>
                <p style={subheadingStyle}>{tx("Saisissez l'adresse e-mail de votre compte et nous vous enverrons un lien de réinitialisation.", 'Enter your account email and we will send you a reset link.')}</p>
              </div>
              <Field
                label={tx('Adresse e-mail', 'Email address')}
                value={email}
                onChange={(v) => { setEmail(v); setFieldErr(''); }}
                type="email"
                placeholder={tx('vous@entreprise.com', 'you@company.com')}
                autoFocus
                error={fieldErr}
              />
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <button
                type="button"
                onClick={goConfirm}
                disabled={!email}
                className="lemtel-btn-primary"
                style={{ height: 50, borderRadius: 14, fontSize: 14, cursor: 'pointer' }}
              >
                {tx('Continuer', 'Continue')}
              </button>
              <button type="button" onClick={onBack} style={ghostBtn}>{tx('Retour à la connexion', 'Back to sign in')}</button>
            </div>
          )}

          {step === 'confirm' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <h2 style={headingStyle}>{tx('Envoyer le lien de réinitialisation ?', 'Send the reset link?')}</h2>
                <p style={subheadingStyle}>{tx('Nous enverrons un lien unique de réinitialisation à :', 'We\u2019ll send a one-time reset link to:')}</p>
                <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, color: C.textIce, fontWeight: 600, fontSize: 14, wordBreak: 'break-all' }}>{email}</div>
              </div>
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <button
                type="button"
                onClick={() => sendReset()}
                disabled={busy}
                className="lemtel-btn-primary"
                style={{ height: 50, borderRadius: 14, fontSize: 14, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {busy && <Spinner />}
                {busy ? tx('Envoi…', 'Sending…') : tx('Envoyer le lien', 'Send link')}
              </button>
              <button type="button" onClick={() => setStep('form')} style={ghostBtn} disabled={busy}>{tx('Annuler', 'Cancel')}</button>
            </div>
          )}

          {step === 'sent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '4px auto 0',
                background: 'rgba(34,197,94,0.14)', border: `1px solid rgba(34,197,94,0.35)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.green, fontSize: 26, fontWeight: 800,
              }}>✓</div>
              <h2 style={{ ...headingStyle, textAlign: 'center' }}>{tx('Vérifiez votre boîte de réception', 'Check your inbox')}</h2>
              <p style={{ ...subheadingStyle, textAlign: 'center' }}>
                {tx('Si un compte existe pour', 'If an account exists for')} <strong style={{ color: C.textIce }}>{email}</strong>{tx(', vous recevrez un lien de réinitialisation sous peu. Ouvrez-le sur cet appareil ou sur un navigateur de bureau pour définir un nouveau mot de passe.', ', you will receive a reset link shortly. Open it on this device or on a desktop browser to set a new password.')}
              </p>
              {resentInfo && (
                <div style={{
                  fontSize: 12, color: C.green,
                  padding: '8px 12px', borderRadius: 10,
                  background: 'rgba(34,197,94,0.10)',
                  border: '1px solid rgba(34,197,94,0.25)',
                }}>{resentInfo}</div>
              )}
              {error && <ErrorBanner>{error}</ErrorBanner>}
              <button
                type="button"
                onClick={() => sendReset({ resend: true })}
                disabled={busy || cooldown > 0}
                style={{
                  height: 44, borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: 'rgba(255,255,255,0.04)',
                  color: cooldown > 0 ? C.textDim : C.textIce,
                  fontSize: 13, fontWeight: 700, letterSpacing: 0.3,
                  cursor: (busy || cooldown > 0) ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: (busy || cooldown > 0) ? 0.7 : 1,
                  transition: 'opacity .15s ease',
                }}
              >
                {busy && <Spinner />}
                {busy
                  ? tx('Envoi…', 'Sending…')
                  : cooldown > 0
                    ? tx(`Renvoyer dans ${cooldown}s`, `Resend in ${cooldown}s`)
                    : tx("Renvoyer l'e-mail", 'Resend email')}
              </button>
              <button type="button" onClick={onBack} className="lemtel-btn-primary" style={{ height: 50, borderRadius: 14, fontSize: 14, cursor: 'pointer' }}>
                {tx('Retour à la connexion', 'Back to sign in')}
              </button>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}

/* ====== Reusable parts ====== */
function GoldGlow() {
  return (
    <div style={{
      position: 'absolute', top: '10%', left: '50%',
      width: 420, height: 420, borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(255,215,0,0.22) 0%, rgba(255,215,0,0.05) 40%, transparent 70%)',
      filter: 'blur(36px)', animation: 'authGlow 6s ease-in-out infinite',
      pointerEvents: 'none', transform: 'translateX(-50%)',
    }} />
  );
}

function Brand() {
  const [tapCount, setTapCount] = useState(0);
  const [debugLogs, setDebugLogs] = useState<string>('');

  const handleLogoTap = async () => {
    const newCount = tapCount + 1;
    if (newCount >= 5) {
      setTapCount(0);
      try {
        const { getPermissionLogs } = await import('../lib/requestPermissionsAfterLogin');
        const logs = await getPermissionLogs();
        setDebugLogs(logs || 'No logs found');
      } catch (e) {
        setDebugLogs('Error loading logs: ' + String(e));
      }
    } else {
      setTapCount(newCount);
      window.setTimeout(() => setTapCount((c) => (c === newCount ? 0 : c)), 1500);
    }
  };

  const clearLogs = async () => {
    try {
      const { clearPermissionLogs } = await import('../lib/requestPermissionsAfterLogin');
      await clearPermissionLogs();
      setDebugLogs('Cleared.');
    } catch {}
  };

  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <div style={logoStyle} onClick={handleLogoTap}>
        <img src="/ava-logo.png" alt="Lemtel" width={72} height={72} style={{ display: 'block', borderRadius: 16 }} />
      </div>
      <div style={{ marginTop: 14, fontSize: 22, fontWeight: 800, color: C.textIce, letterSpacing: 0.2 }}>Lemtel</div>
      <div style={{ marginTop: 4, fontSize: 11, color: C.textSub, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 600 }}>{tx("Téléphonie d'entreprise IA", 'AI business telephony')}</div>
      {debugLogs ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', flexDirection: 'column', padding: 16 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={() => setDebugLogs('')} style={{ padding: '8px 14px', borderRadius: 8, background: '#FFD700', color: '#0b1530', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Close</button>
            <button type="button" onClick={clearLogs} style={{ padding: '8px 14px', borderRadius: 8, background: '#EF4444', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer' }}>Clear</button>
            <div style={{ color: '#FFD700', fontSize: 13, alignSelf: 'center', fontWeight: 700 }}>Permission Logs</div>
          </div>
          <pre style={{ flex: 1, overflow: 'auto', background: '#0A1429', color: '#E8EEFB', padding: 12, borderRadius: 8, fontSize: 11, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, textAlign: 'left' }}>{debugLogs}</pre>
        </div>
      ) : null}
    </div>
  );
}

function Footer() {
  return (
    <div style={{
      padding: '14px 16px calc(20px + var(--safe-bottom))', textAlign: 'center',
      fontSize: 11, color: C.textDim, letterSpacing: 0.4,
      position: 'relative', zIndex: 1,
    }}>
      {tx('Conçu par', 'Crafted by')} <span style={{ color: C.gold, fontWeight: 600 }}>AVA Statistic · assistantvirtualai.com</span>
    </div>
  );
}

function ModeToggle({ mode, accent, onChange }: { mode: Mode; accent: Accent; onChange: (m: Mode) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
      {(['extension', 'email'] as Mode[]).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              flex: 1, padding: '9px 10px', borderRadius: 9, cursor: 'pointer',
              fontSize: 11, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase',
              border: 'none',
              background: active ? accentGradient(accent) : 'transparent',
              color: active ? '#0b1530' : C.textSub,
              transition: 'background .15s ease, color .15s ease',
            }}
          >
            {m === 'extension' ? 'Extension' : 'Email'}
          </button>
        );
      })}
    </div>
  );
}

/* Accent (theme) switch — persisted in localStorage and applied via CSS var. */
function AccentSwitch({ accent, onChange, readOnly }: { accent: Accent; onChange?: (a: Accent) => void; readOnly?: boolean }) {
  const opts: { id: Accent; label: string }[] = [
    { id: 'gold-cyan', label: 'Gold → Cyan' },
    { id: 'cyan-gold', label: 'Cyan → Gold' },
  ];
  return (
    <div style={{
      position: 'absolute', top: 'calc(8px + var(--safe-top))', right: 10, zIndex: 2,
      display: 'flex', gap: 4, padding: 3, borderRadius: 999,
      background: 'rgba(16,26,48,0.65)', border: `1px solid ${C.border}`,
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    }}>
      {opts.map((o) => {
        const active = accent === o.id;
        return (
          <button
            key={o.id}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(o.id)}
            aria-pressed={active}
            title={tx('Thème : ', 'Theme: ') + o.label}
            style={{
              border: 'none', cursor: readOnly ? 'default' : 'pointer',
              padding: '5px 10px', borderRadius: 999,
              fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase',
              background: active ? accentGradient(o.id) : 'transparent',
              color: active ? '#0b1530' : C.textSub,
              transition: 'background .15s ease, color .15s ease',
            }}
          >
            {o.id === 'gold-cyan' ? 'G→C' : 'C→G'}
          </button>
        );
      })}
    </div>
  );
}

function ErrorBanner({ children, failure }: { children: React.ReactNode; failure?: AuthFailure | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="alert" style={{
      fontSize: 12, color: C.red,
      padding: '10px 14px', borderRadius: 10,
      background: 'rgba(239,68,68,0.10)',
      border: '1px solid rgba(239,68,68,0.22)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div>{children}</div>
      {failure && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={chipStyle('step')}>{tx('étape', 'step')} : {failure.step}</span>
          <span style={chipStyle('code')}>{tx('code', 'code')} : {failure.code}</span>
          {failure.detail && (
            <button type="button" onClick={() => setOpen((o) => !o)}
              style={{ ...chipStyle('toggle'), cursor: 'pointer' }}>
              {open ? tx('masquer les détails', 'hide details') : tx('détails', 'details')}
            </button>
          )}
        </div>
      )}
      {open && failure?.detail && (
        <pre style={{
          margin: 0, padding: 8, borderRadius: 8,
          background: 'rgba(0,0,0,0.35)', color: '#FCA5A5',
          fontSize: 10.5, lineHeight: 1.4, maxHeight: 140, overflow: 'auto',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        }}>{failure.detail}</pre>
      )}
    </div>
  );
}

function chipStyle(_kind: 'step' | 'code' | 'toggle'): React.CSSProperties {
  return {
    fontSize: 10, fontFamily: 'Fira Code, monospace',
    padding: '2px 8px', borderRadius: 999,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: C.textIce,
  };
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid rgba(11,21,48,0.25)', borderTopColor: '#0b1530',
        animation: 'spin 0.7s linear infinite', display: 'inline-block',
      }}
    />
  );
}

function Field({ label, value, onChange, type = 'text', autoFocus, placeholder, error }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; autoFocus?: boolean; placeholder?: string; error?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 10, color: C.textSub, textTransform: 'uppercase', letterSpacing: 1.6, fontWeight: 700 }}>{label}</span>
      <input
        className="lemtel-input"
        type={type}
        value={value}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={error ? { borderColor: 'rgba(239,68,68,0.55)' } : undefined}
      />
      {error && <span style={{ fontSize: 11, color: C.red, marginTop: 2 }}>{error}</span>}
    </label>
  );
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', minHeight: '100vh',
  background: `radial-gradient(900px 600px at 50% -10%, rgba(11,181,214,0.10), transparent 60%), ${C.bg}`,
  color: C.text,
  paddingTop: 'var(--safe-top)',
  position: 'relative', overflow: 'hidden',
};

const logoStyle: React.CSSProperties = {
  width: 84, height: 84, borderRadius: 20, margin: '0 auto',
  background: 'linear-gradient(135deg, rgba(255,215,0,0.18), rgba(11,181,214,0.18))',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 24px 60px -18px rgba(255,215,0,0.40), inset 0 1px 0 rgba(255,255,255,0.18)',
  border: '1px solid rgba(255,215,0,0.20)',
  padding: 6,
};

const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 360,
  background: C.bgCard,
  border: `1px solid ${C.border}`,
  borderRadius: 22, padding: 22,
  boxShadow: '0 25px 60px rgba(0,0,0,0.55)',
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  animation: 'fadeIn .4s ease-out',
};

const ghostBtn: React.CSSProperties = {
  marginTop: 2, height: 38, borderRadius: 12,
  border: `1px solid ${C.border}`,
  background: 'transparent', color: C.textSub,
  fontSize: 12, fontWeight: 600, letterSpacing: 0.4, cursor: 'pointer',
};

const ghostLink: React.CSSProperties = {
  height: 30, border: 'none', background: 'transparent',
  color: C.avaCyan, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  textDecoration: 'underline', textUnderlineOffset: 3,
};

const headingStyle: React.CSSProperties = {
  margin: 0, fontSize: 18, fontWeight: 800, color: C.textIce, letterSpacing: 0.2,
};

const subheadingStyle: React.CSSProperties = {
  margin: '6px 0 0', fontSize: 12.5, color: C.textSub, lineHeight: 1.5,
};
