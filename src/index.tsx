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

function markBootReady() {
  try {
    const win = window as BootWindow;
    win.__PP_REACT_BOOTED__ = true;
  } catch {}
}

/**
 * The boot flag used to be set only by <NativeBootMarker /> deep inside the
 * provider tree. If any provider or lazy chunk was slow (cold start on iOS),
 * the old watchdog could paint a diagnostic overlay on top of an app that was
 * actually booting fine — and it never went away.
 * We now mark the boot as soon as React commits anything into #root.
 */
function watchFirstPaint(container: HTMLElement) {
  const deadline = Date.now() + 20000;
  const tick = () => {
    const painted = container.children.length > 0 && !container.querySelector('[data-pp-boot-visible]');
    if (painted) { markBootReady(); void hideSplash('first-paint'); return; }
    if (Date.now() < deadline) window.setTimeout(tick, 150);
  };
  window.setTimeout(tick, 0);
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
      return null;
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
// IMPORTANT: on Android the viewport meta already blocks zoom, and calling
// preventDefault() on rapid touchend sequences kills momentum scrolling
// (Messages page freezing). So the double-tap guard is iOS-only, and only
// fires when the two taps land on the same spot.
if (typeof document !== 'undefined') {
  const isAndroid = Capacitor.getPlatform() === 'android';
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());
  if (!isAndroid) {
    let lastTouchEnd = 0;
    let lastX = 0;
    let lastY = 0;
    document.addEventListener(
      'touchend',
      (e) => {
        const t = e.changedTouches?.[0];
        const x = t?.clientX ?? 0;
        const y = t?.clientY ?? 0;
        const now = Date.now();
        const sameSpot = Math.abs(x - lastX) < 30 && Math.abs(y - lastY) < 30;
        if (now - lastTouchEnd <= 300 && sameSpot && e.cancelable) e.preventDefault();
        lastTouchEnd = now;
        lastX = x;
        lastY = y;
      },
      { passive: false },
    );
  }
  document.addEventListener('dblclick', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable) return;
    e.preventDefault();
  });
}

/**
 * Android only: make the WebView own the whole screen like iOS.
 * Configure native edge-to-edge chrome before rendering the app.
 */
async function configureAndroidChrome() {
  if (!Capacitor.isNativePlatform()) return;
  let theme: 'light' | 'dark' = 'light';
  try {
    const v = localStorage.getItem('mplanipret-theme');
    if (v === 'light' || v === 'dark') theme = v;
  } catch {}
  const { applyNativeChrome } = await import('@/lib/nativeChrome');
  await applyNativeChrome(theme);
}


let splashHidden = false;
/**
 * Hide the native splash as soon as the web app is ready.
 * This is an immediate safety hide; native auto-hide is also enabled.
 */
async function hideSplash(reason: string) {
  if (splashHidden) return;
  splashHidden = true;
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 0 });
    console.log('[PP] splash hidden', reason);
  } catch {}
}

async function bootstrap() {
  // Bump this on every native-affecting change so Xcode logs prove which
  // bundle the device is actually running.
  console.log('[PP] BUILD MARKER pp-build-2026-08-04-boot-retry');
  console.log('[PP] bootstrap:start', { native: Capacitor.isNativePlatform(), proto: window.location.protocol });
  void configureAndroidChrome();
  if (Capacitor.getPlatform() === 'android') void hideSplash('android-boot');
  // Safety net: never leave the user staring at the launch image, even if the
  // first React commit never happens (render error, slow chunk, no network).
  window.setTimeout(() => { void hideSplash('safety-timeout'); }, 4000);
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
    const detail =
      e instanceof Error
        ? `${e.name}: ${e.message}\n${e.stack ?? ''}`
        : (() => { try { return JSON.stringify(e); } catch { return String(e); } })();
    console.error('[PP] Render failed:', detail);

    const container = document.getElementById('root');

    // iOS/Capacitor throws opaque, empty-object exceptions during the legacy
    // ReactDOM.render bootstrap. Those are startup artifacts, not real render
    // failures: retry once through createRoot before showing the error screen.
    if (container && isIgnorableNativeStartupError(e)) {
      try {
        console.warn('[PP] ignorable native startup error — retrying mount via createRoot');
        container.innerHTML = '';
        const root = createRoot(container, {
          onRecoverableError(error) {
            if (isIgnorableNativeStartupError(error)) return;
            console.error('[PP] React recoverable error:', error);
          },
        });
        root.render(
          <NativeRootRecoveryBoundary>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </NativeRootRecoveryBoundary>,
        );
        watchFirstPaint(container);
        window.setTimeout(() => { (window as BootWindow).__PP_REACT_MOUNT_CALLED__ = true; }, 0);
        return;
      } catch (retryError) {
        console.error('[PP] createRoot retry failed:', retryError);
      }
    }

    if (container) {
      void hideSplash('render-failed');
      container.innerHTML =
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
