/**
 * Planiprêt Mobile — Standalone Capacitor app entry
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
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
    // React.StrictMode intentionally double-mounts components in development,
    // which triggers error boundaries with empty errors on Capacitor iOS.
    // We disable it unconditionally in this native build.
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
