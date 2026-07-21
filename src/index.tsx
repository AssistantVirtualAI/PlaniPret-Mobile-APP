/**
 * Planiprêt Mobile — Standalone Capacitor app entry
 *
 * iOS WKWebView bootstrap order:
 *  1. Wait 50 ms — lets the JS engine + localStorage fully initialize
 *  2. Mount React tree via createRoot (React 18 concurrent mode)
 *  3. Hide splash screen after first paint
 *
 * The EventTarget patch and isIgnorableNativeStartupError filter are applied
 * in index.html (before this script loads) so they are already active when
 * React installs its event listeners.
 *
 * The vendor-react bundle is patched at build time (vite.config.ts) to
 * prevent Pa() from unmounting the tree on empty-object iOS errors.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import App from './App';
import './styles.css';

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

async function bootstrap() {
  // Give iOS WKWebView a tick to fully initialize localStorage + JS engine
  // before any Supabase auth call touches storage.
  if (Capacitor.isNativePlatform()) {
    await new Promise<void>(resolve => setTimeout(resolve, 50));
  }

  // Configure native status bar
  if (Capacitor.isNativePlatform()) {
    try { await StatusBar.setStyle({ style: Style.Dark }); } catch { /* non-fatal */ }
  }

  const container = document.getElementById('root');
  if (!container) {
    console.error('[PP] Root element not found');
    return;
  }

  if (container.textContent?.trim() === 'Démarrage...') container.innerHTML = '';

  try {
    createRoot(container, {
      onRecoverableError(error) {
        // Swallow empty-object errors from iOS WKWebView native startup.
        // The vendor-react patch (vite.config.ts) handles the fatal path;
        // this handles the recoverable path.
        if (
          error &&
          typeof error === 'object' &&
          Object.keys(error as object).length === 0 &&
          String((error as any).message ?? '').trim() === ''
        ) {
          console.warn('[PP] onRecoverableError: swallowed empty iOS artefact');
          return;
        }
        console.error('[PP] React recoverable error:', error);
      },
    }).render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
  } catch (e) {
    console.error('[PP] Render failed:', e);
    container.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1425;color:#E2E8F0;font-family:system-ui;padding:24px;text-align:center">Impossible de démarrer l\'application. Vérifiez votre connexion et relancez.</div>';
  }
}

bootstrap().catch(e => console.error('[PP] bootstrap crashed:', e));
