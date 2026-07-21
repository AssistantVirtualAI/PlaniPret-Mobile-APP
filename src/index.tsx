/**
 * Planiprêt Mobile — Standalone Capacitor app entry
 *
 * IMPORTANT: This file installs a global error interceptor BEFORE React mounts.
 * iOS Capacitor throws empty {} objects internally (e.g. StatusBar UNIMPLEMENTED).
 * These must be swallowed before they reach React's error boundary machinery.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles.css';

// ─── GLOBAL iOS CAPACITOR ERROR ABSORBER ────────────────────────────────────
// Must be installed BEFORE React mounts. iOS Capacitor throws {} objects that
// have no message, no stack, and no meaningful content. React's error boundary
// cannot distinguish these from real errors. We intercept them here globally.
function hasRealMessage(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'string') return err.trim().length > 0;
  if (err instanceof Error) return !!(err.message && err.message.trim());
  if (typeof err === 'object') {
    // Check all possible message-bearing properties including non-enumerable
    for (const key of ['message', 'stack', 'name', 'description', 'reason']) {
      try {
        const val = (err as any)[key];
        if (val && typeof val === 'string' && val.trim() && val !== 'Error' && val !== 'undefined') {
          return true;
        }
      } catch { /* ignore */ }
    }
    return false;
  }
  return true;
}

// Intercept synchronous errors before React sees them
const _origOnerror = window.onerror;
window.onerror = function(msg, src, line, col, err) {
  if (!hasRealMessage(err) && (!msg || msg === 'Script error.' || msg === 'undefined')) {
    console.warn('[PP] Swallowed empty iOS Capacitor error:', err);
    return true; // Prevent default — stops React from seeing it
  }
  return _origOnerror ? _origOnerror.call(this, msg, src, line, col, err) : false;
};

// Intercept unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
  if (!hasRealMessage(e.reason)) {
    console.warn('[PP] Swallowed empty iOS Capacitor rejection:', e.reason);
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}, true);

// ─── GLOBAL ANTI-ZOOM GUARDS ─────────────────────────────────────────────────
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

// ─── BOOTSTRAP ───────────────────────────────────────────────────────────────
async function bootstrap() {
  try {
    if (Capacitor.isNativePlatform()) {
      try { await StatusBar.setStyle({ style: Style.Dark }); } catch (e) { console.log('[PP] StatusBar.setStyle:', e); }
      try { await StatusBar.setBackgroundColor({ color: '#1A4A8A' }); } catch (e) { console.log('[PP] StatusBar.setBackgroundColor:', e); }
      try { await SplashScreen.hide(); } catch (e) { console.log('[PP] SplashScreen.hide:', e); }
    }
  } catch (e) {
    console.error('[PP] Native init failed:', e);
  }
  try {
    const container = document.getElementById('root');
    if (!container) throw new Error('Root element not found');
    // React.StrictMode is disabled — it causes double-mount artefacts on iOS Capacitor
    createRoot(container).render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
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
    if (Capacitor.isNativePlatform()) SplashScreen.hide().catch(() => {});
  } catch {}
}, 3000);

bootstrap().catch((e) => console.error('[PP] bootstrap crashed:', e));
