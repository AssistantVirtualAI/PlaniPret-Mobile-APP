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

function isIgnorableNativeStartupError(raw: unknown): boolean {
  const rawText = String(raw instanceof Error ? raw.message : raw ?? '');
  if (/multi_header\.length|multi_header/i.test(rawText)) return true;
  if (!raw || typeof raw !== 'object') return !raw;
  const obj = raw as Record<string, unknown>;
  const message = String(obj.message ?? obj.errorMessage ?? '').trim();
  const code = String(obj.code ?? '').trim();
  if (/multi_header\.length|multi_header/i.test(message)) return true;
  return code === 'UNIMPLEMENTED' && /not implemented/i.test(message);
}

if (typeof window !== 'undefined') {
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
    (window as any).__PP_REACT_BOOT_ATTEMPTED__ = true;
    if (container.textContent?.trim() === 'Démarrage...') container.innerHTML = '';
    const appTree = (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );


    // iOS Capacitor is crashing inside React 18's createRoot event bootstrap
    // before the first commit (vendor-react line in Xcode). Native shells do
    // not need concurrent rendering here, so use the React 17-compatible mount
    // path for Capacitor only and keep createRoot for web/dev preview.
    if (Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:') {
      legacyRender(appTree, container);
      window.setTimeout(() => { (window as any).__PP_REACT_MOUNT_CALLED__ = true; }, 0);
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
    window.setTimeout(() => { (window as any).__PP_REACT_MOUNT_CALLED__ = true; }, 0);
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
