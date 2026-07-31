/**
 * Planiprêt Mobile — Point d'entrée Capacitor
 * App ID : com.planipret.mobile
 *
 * Ce fichier est le bootstrap natif (iOS/Android).
 * Il charge l'app React qui pointe vers /mplanipret/* du portail web AVA.
 * La séparation Lemtel/Planipret est garantie par :
 *   - AppSeparationGuard (côté web)
 *   - MplanipretGuard (côté web)
 *   - requirePlanipretBroker (côté Edge Functions)
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import PlanipretMobileApp from './PlanipretMobileApp';
import './styles.css';

async function bootstrap() {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
      } catch (e) {
        console.log('[PlanipretMobile] StatusBar.setStyle not supported:', e);
      }
      try {
        await StatusBar.setBackgroundColor({ color: '#1A4A8A' });
      } catch (e) {
        // Not implemented on iOS — safe to ignore
        console.log('[PlanipretMobile] StatusBar color not supported:', e);
      }
      try {
        await SplashScreen.hide();
      } catch (e) {
        console.log('[PlanipretMobile] SplashScreen.hide failed:', e);
      }
    }
  } catch (e) {
    console.error('[PlanipretMobile] Native init failed, continuing:', e);
  }

  try {
    const container = document.getElementById('root');
    if (!container) throw new Error('Root element not found');
    const root = createRoot(container);
    root.render(<PlanipretMobileApp />);
  } catch (e) {
    console.error('[PlanipretMobile] Render failed:', e);
    const el = document.getElementById('root');
    if (el) {
      el.innerHTML =
        '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A1425;color:#E2E8F0;font-family:system-ui;padding:24px;text-align:center">Impossible de démarrer l\'application. Vérifiez votre connexion et relancez.</div>';
    }
  }
}

// Failsafe: if bootstrap hangs, force root visible + hide splash after 3s so
// the user is never stuck on the native splash screen.
setTimeout(() => {
  try {
    const el = document.getElementById('root');
    if (el) el.style.display = 'block';
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide().catch(() => {});
    }
  } catch {}
}, 3000);

bootstrap().catch((e) => console.error('[PlanipretMobile] bootstrap crashed:', e));
