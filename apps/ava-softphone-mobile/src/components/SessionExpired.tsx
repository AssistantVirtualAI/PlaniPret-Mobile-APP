import { gradients, colors } from '../lib/theme';
import { useT } from '../lib/i18n';

export default function SessionExpired({ onSignOut }: { onSignOut: () => void }) {
  const { tx } = useT();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', padding: 24, background: gradients.app, color: colors.textIce, textAlign: 'center',
    }}>
      <div style={{
        maxWidth: 360, padding: 24, borderRadius: 16,
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>{tx('Session expirée', 'Session expired')}</h2>
        <p style={{ margin: '0 0 20px', opacity: 0.8, fontSize: 14, lineHeight: 1.5 }}>
          {tx('Votre session a expiré. Veuillez vous reconnecter pour continuer.', 'Your session has expired. Please sign in again to continue.')}
        </p>
        <button
          onClick={onSignOut}
          style={{
            width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
            background: '#0023e6', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {tx('Se reconnecter', 'Sign in again')}
        </button>
      </div>
    </div>
  );
}
