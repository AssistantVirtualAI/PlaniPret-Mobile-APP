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
function isIgnorableNativeStartupError(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return !raw;
  const obj = raw as Record<string, unknown>;
  const message = String(obj.message ?? obj.errorMessage ?? '').trim();
  const code = String(obj.code ?? '').trim();
  const keys = new Set([...Object.keys(obj), ...Object.getOwnPropertyNames(obj)]);
  return (
    (!message && keys.size <= 3 && [...keys].every((k) => ['stack', 'name', 'message', 'errorMessage'].includes(k))) ||
    (code === 'UNIMPLEMENTED' && /not implemented/i.test(message))
  );
}

if (typeof window !== 'undefined') {
  // Use capture phase (true) to intercept before any other handler
  window.addEventListener('error', (event) => {
    if (!isIgnorableNativeStartupError((event as ErrorEvent).error)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn('[PP] Swallowed empty iOS Capacitor error');
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    if (!isIgnorableNativeStartupError(event.reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn('[PP] Swallowed empty iOS Capacitor rejection');
  }, true);
}

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
      try { await SplashScreen.hide(); } catch (e) { console.log('[PP] SplashScreen.hide:', e); }
    }
  } catch (e) {
    console.error('[PP] Native init failed:', e);
  }
  try {
    const container = document.getElementById('root');
    if (!container) throw new Error('Root element not found');
    // Clear the placeholder text before React mounts
    const placeholderText = container.textContent?.trim() ?? '';
    if (placeholderText === 'Chargement...' || placeholderText === 'Démarrage...') container.innerHTML = '';
    // React.StrictMode is disabled — it causes double-mount artefacts on iOS Capacitor
    // onRecoverableError intercepts errors that React re-throws internally (e.g. from commitRoot)
    // This is the ONLY way to catch {} artefacts that bypass ErrorBoundary and window.onerror
    createRoot(container, {
      onRecoverableError: (error: unknown, errorInfo: { componentStack?: string | null }) => {
        if (isIgnorableNativeStartupError(error)) {
          console.warn('[PP] onRecoverableError: swallowed empty iOS artefact');
          return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[PP] onRecoverableError:', msg, errorInfo?.componentStack ?? '');
      },
    }).render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    // Mark that React has booted — used by index.html fallback timer
    (window as any).__PP_REACT_BOOTED__ = true;
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
