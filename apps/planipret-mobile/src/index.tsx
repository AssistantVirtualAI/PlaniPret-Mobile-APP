/**
 * Planiprêt Mobile — Standalone Capacitor app entry
 */
import React from 'react';
import { render as legacyRender } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles.css';
import { scheduleRuntimeSmokeCheck } from './lib/runtimeSmoke';

type BootWindow = Window & {
  __PP_REACT_BOOTED__?: boolean;
  __PP_REACT_BOOT_ATTEMPTED__?: boolean;
  __PP_REACT_MOUNT_CALLED__?: boolean;
  __PP_MARK_BOOT_READY__?: () => void;
  __PP_SHOW_BOOT_FALLBACK__?: (message?: string) => void;
  __PP_DISABLE_NATIVE_BOOT_FALLBACK__?: boolean;
};

function isIgnorableNativeStartupError(raw: unknown): boolean {
  if (typeof raw === 'string') return /multi_header\.length|multi_header/i.test(raw);
  const rawText = String(raw instanceof Error ? raw.message : raw ?? '');
  if (/multi_header\.length|multi_header/i.test(rawText)) return true;
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  const message = String(obj.message ?? obj.errorMessage ?? '').trim();
  const code = String(obj.code ?? '').trim();
  if (/multi_header\.length|multi_header/i.test(message)) return true;
  if (!message && !code && Object.keys(obj).length === 0) return true;
  return code === 'UNIMPLEMENTED' && /not implemented/i.test(message);
}

function showNativeBootFallback(message?: string) {
  try {
    if ((window as BootWindow).__PP_DISABLE_NATIVE_BOOT_FALLBACK__) return;
    ((window as BootWindow).__PP_SHOW_BOOT_FALLBACK__ ?? (() => undefined))(message);
  } catch {}
}

function markBootReady() {
  try {
    const win = window as BootWindow;
    win.__PP_REACT_BOOTED__ = true;
    const fallback = document.getElementById('pp-native-boot-fallback');
    if (fallback) fallback.style.display = 'none';
  } catch {}
}

/**
 * The boot flag used to be set only by <NativeBootMarker /> deep inside the
 * provider tree. If any provider or lazy chunk was slow (cold start on iOS),
 * the 4.5s watchdog painted the "démarrage interrompu" overlay on top of an
 * app that was actually booting fine — and it never went away.
 * We now mark the boot as soon as React commits anything into #root.
 */
function watchFirstPaint(container: HTMLElement) {
  const deadline = Date.now() + 20000;
  const tick = () => {
    const painted = container.children.length > 0 && !container.querySelector('[data-pp-boot-visible]');
    if (painted) { markBootReady(); return; }
    if (Date.now() < deadline) window.setTimeout(tick, 150);
  };
  window.setTimeout(tick, 0);
}


function NativeBootErrorFallback({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A1425', color: '#E2E8F0', fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,sans-serif', padding: 24, textAlign: 'center' }}>
      <div style={{ maxWidth: 340 }}>
        <div style={{ width: 58, height: 58, borderRadius: 18, background: '#fff', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A4A8A', fontWeight: 800, fontSize: 20 }}>PP</div>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>Planiprêt Mobile</div>
        <div style={{ fontSize: 13, lineHeight: 1.45, opacity: 0.82, marginBottom: 18, wordBreak: 'break-word' }}>{message || "Le démarrage a été interrompu. Relancez l’application."}</div>
        <button onClick={onRetry} style={{ border: 0, borderRadius: 12, background: '#2E9BDC', color: 'white', fontWeight: 800, padding: '12px 18px' }}>Relancer</button>
      </div>
    </div>
  );
}

class NativeRootRecoveryBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; retryKey: number }> {
  state: { error: Error | null; retryKey: number } = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error) {
    if (isIgnorableNativeStartupError(error)) return { error: null };
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (isIgnorableNativeStartupError(error)) {
      console.warn('[PP] native startup artifact swallowed; remounting root');
      this.setState((state) => {
        const nextRetryKey = state.retryKey + 1;
        if (nextRetryKey > 3) {
          return { error: null, retryKey: nextRetryKey };
        }
        return { error: null, retryKey: nextRetryKey };
      });
      return;
    }
    console.error('[PP] root render failed:', error, info);
  }

  private retry = () => {
    this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      const message = this.state.error.message || 'Erreur de démarrage inconnue.';
      return <NativeBootErrorFallback message={message} onRetry={this.retry} />;
    }
    return <React.Fragment key={this.state.retryKey}>{this.props.children}</React.Fragment>;
  }
}

if (typeof window !== 'undefined') {
  (window as BootWindow).__PP_DISABLE_NATIVE_BOOT_FALLBACK__ = true;
  (window as BootWindow).__PP_MARK_BOOT_READY__ = markBootReady;
  window.addEventListener('error', (event) => {
    if (!isIgnorableNativeStartupError((event as ErrorEvent).error) && !isIgnorableNativeStartupError((event as ErrorEvent).message)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    if (!isIgnorableNativeStartupError(event.reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

// Global anti-zoom guards for iOS/Android WebView (no pinch, no double-tap zoom).
if (typeof document !== 'undefined') {
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false },
  );
  document.addEventListener('dblclick', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
    e.preventDefault();
  });
}

async function hideSplashSoon() {
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {}
}

async function bootstrap() {
  console.log('[PP] bootstrap:start', { native: Capacitor.isNativePlatform(), proto: window.location.protocol });
  // Hide splash immediately so a render error can never leave the user staring
  // at the launch image with no signal.
  void hideSplashSoon();
  try {
    const container = document.getElementById('root');
    if (!container) throw new Error('Root element not found');
    (window as BootWindow).__PP_REACT_BOOT_ATTEMPTED__ = true;
    if (container.textContent?.trim() === 'Démarrage...') container.innerHTML = '';
    const appTree = (
      <NativeRootRecoveryBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </NativeRootRecoveryBoundary>
    );


    // iOS Capacitor is crashing inside React 18's createRoot event bootstrap
    // before the first commit (vendor-react line in Xcode). Native shells do
    // not need concurrent rendering here, so use the React 17-compatible mount
    // path for Capacitor only and keep createRoot for web/dev preview.
    if (Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:') {
      legacyRender(appTree, container);
      watchFirstPaint(container);
      scheduleRuntimeSmokeCheck();
      window.setTimeout(() => { (window as BootWindow).__PP_REACT_MOUNT_CALLED__ = true; }, 0);
      return;
    }

    // React.StrictMode intentionally double-mounts components in development,
    // which triggers error boundaries with empty errors on Capacitor iOS.
    // We disable it unconditionally in this native build.
    const root = createRoot(container, {
      onRecoverableError(error) {
        if (isIgnorableNativeStartupError(error)) return;
        console.error('[PP] React recoverable error:', error);
      },
    });
    root.render(appTree);
    watchFirstPaint(container);
    window.setTimeout(() => { (window as BootWindow).__PP_REACT_MOUNT_CALLED__ = true; }, 0);
  } catch (e) {
    console.error('[PP] Render failed:', e);
    const el = document.getElementById('root');
    if (el) {
      el.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1425;color:#E2E8F0;font-family:system-ui;padding:24px;text-align:center">Impossible de démarrer l\'application. Vérifiez votre connexion et relancez.</div>';
    }
  }
}

setTimeout(() => {
  try {
    const el = document.getElementById('root');
    if (el) el.style.display = 'block';
  } catch {}
}, 3000);

bootstrap().catch((e) => console.error('[PP] bootstrap crashed:', e));
