/**
 * Planiprêt Mobile — Standalone Capacitor app entry
 *
 * iOS WKWebView bootstrap order:
 *  1. Wait 50 ms — lets the JS engine + localStorage fully initialize
 *  2. Mount React tree
 *  3. Hide splash screen 300 ms after mount (first frame already painted)
 *
 * This avoids the "Chargement…" freeze caused by Supabase auth.getSession()
 * being called before WKWebView storage is ready.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles.css';

async function bootstrap() {
  // Give iOS WKWebView a tick to fully initialize localStorage + JS engine
  // before any Supabase auth call touches storage.
  if (Capacitor.isNativePlatform()) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Configure native UI
  try {
    if (Capacitor.isNativePlatform()) {
      try { await StatusBar.setStyle({ style: Style.Dark }); } catch (e) { console.log('[PP] StatusBar.setStyle:', e); }
      try { await StatusBar.setBackgroundColor({ color: '#030712' }); } catch (e) { console.log('[PP] StatusBar.setBackgroundColor:', e); }
    }
  } catch (e) {
    console.error('[PP] Native init failed:', e);
  }

  // Mount React
  try {
    const container = document.getElementById('root');
    if (!container) throw new Error('Root element not found');
    createRoot(container).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>,
    );
  } catch (e) {
    console.error('[PP] Render failed:', e);
    const el = document.getElementById('root');
    if (el) {
      el.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#030712;color:#E2E8F0;font-family:system-ui;padding:24px;text-align:center">Impossible de démarrer l\'application. Vérifiez votre connexion et relancez.</div>';
    }
  }

  // Hide splash screen AFTER React has had time to paint the first frame.
  // Doing it here (after render()) ensures the user sees the app UI, not a blank screen.
  if (Capacitor.isNativePlatform()) {
    setTimeout(() => SplashScreen.hide().catch(() => {}), 300);
  }
}

// Safety net: force-hide splash screen after 5 s no matter what.
if (Capacitor.isNativePlatform()) {
  setTimeout(() => {
    try { SplashScreen.hide().catch(() => {}); } catch {}
  }, 5000);
}

bootstrap().catch((e) => console.error('[PP] bootstrap crashed:', e));
