/**
 * PlanipretMobileApp — Composant racine de l'application Planiprêt Mobile
 *
 * Architecture :
 * - En mode natif (Capacitor iOS/Android) : charge le portail web AVA via WebView
 *   et navigue directement vers /mplanipret
 * - En mode web (PWA) : redirige vers /mplanipret
 *
 * La logique métier complète (SIP, NS-API, Supabase) réside dans le portail web
 * sous src/pages/planipret/mobile/*. Ce fichier est uniquement le shell natif.
 */
import React, { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/supabase';

// ─── Constantes ───────────────────────────────────────────────────────────────
const PORTAL_URL = 'https://avastatistic.ca';
const MOBILE_ENTRY = '/mplanipret';

// ─── Composant principal ───────────────────────────────────────────────────────
export default function PlanipretMobileApp() {
  const [isOnline, setIsOnline] = useState(true);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    // Surveillance réseau (best-effort — n'empêche jamais le rendu)
    try {
      Network.addListener('networkStatusChange', (status) => {
        setIsOnline(status.connected);
      });
    } catch (e) {
      console.log('[PlanipretMobile] Network listener failed:', e);
    }

    if (isNative) {
      try {
        CapApp.addListener('appUrlOpen', (event) => {
          try {
            const url = new URL(event.url);
            if (url.protocol === 'planipret:') {
              console.log('[PlanipretMobile] Deep link:', event.url);
            }
          } catch {}
        });
      } catch (e) {
        console.log('[PlanipretMobile] appUrlOpen listener failed:', e);
      }

      // Push registration ne doit jamais bloquer l'UI
      try { registerPushNotifications(); } catch (e) { console.log('[PlanipretMobile] push init failed:', e); }
    }

    // Redirection vers le portail mobile — timeout dur de 3s pour ne jamais
    // rester bloqué sur le splash si un plugin natif ne répond pas.
    const target = isNative ? `${PORTAL_URL}${MOBILE_ENTRY}` : MOBILE_ENTRY;
    const redirect = () => {
      try {
        if (!window.location.href.includes(MOBILE_ENTRY)) {
          window.location.replace(target);
        }
      } catch (e) {
        console.error('[PlanipretMobile] redirect failed:', e);
      }
    };
    const t = window.setTimeout(redirect, 800);
    const failsafe = window.setTimeout(redirect, 3000);

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(failsafe);
      try { Network.removeAllListeners(); } catch {}
      try { CapApp.removeAllListeners(); } catch {}
    };
  }, [isNative]);


  // En mode natif, l'app charge le portail web dans une WebView Capacitor
  // La WebView est configurée dans capacitor.config.ts (server.url en dev)
  // En production, le build Vite du portail web est copié dans dist/
  if (!isOnline) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #060D1A 0%, #0A1425 100%)',
        color: '#4A7FA5',
        fontFamily: 'system-ui, sans-serif',
        gap: 16,
      }}>
        <div style={{ fontSize: 48 }}>📡</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#E2E8F0' }}>Connexion requise</div>
        <div style={{ fontSize: 14, color: '#4A7FA5', textAlign: 'center', maxWidth: 280 }}>
          Vérifiez votre connexion internet pour accéder à Planiprêt Mobile.
        </div>
      </div>
    );
  }

  // Splash de chargement initial
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(160deg, #060D1A 0%, #0A1425 100%)',
      color: '#2E9BDC',
      fontFamily: 'system-ui, sans-serif',
      gap: 20,
    }}>
      {/* Logo Planiprêt */}
      <div style={{
        width: 80, height: 80,
        borderRadius: 20,
        background: 'linear-gradient(135deg, #1A4A8A, #2E9BDC)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 32px rgba(46,155,220,0.4)',
        fontSize: 36,
      }}>
        🏠
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#E2E8F0', letterSpacing: '0.05em' }}>
        Planiprêt
      </div>
      <div style={{
        width: 40, height: 4,
        borderRadius: 2,
        background: 'linear-gradient(90deg, #1A4A8A, #2E9BDC)',
        animation: 'pp-loading 1.2s ease-in-out infinite',
      }} />
      <style>{`
        @keyframes pp-loading {
          0%, 100% { opacity: 0.3; transform: scaleX(0.5); }
          50% { opacity: 1; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}

// ─── Push Notifications ────────────────────────────────────────────────────────
async function registerPushNotifications() {
  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      console.log('[PlanipretMobile] Push token:', token.value);
      // Envoyer le token au backend Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('planipret_profiles')
          .update({
            push_token: token.value,
            push_platform: Capacitor.getPlatform(),
          })
          .eq('user_id', user.id);
      }
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[PlanipretMobile] Notification reçue:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[PlanipretMobile] Action notification:', action);
      // Naviguer vers la page appropriée selon le type de notification
      const data = action.notification.data;
      if (data?.type === 'incoming_call') {
        // Ouvrir le dialer
        window.location.href = `${MOBILE_ENTRY}/calls`;
      } else if (data?.type === 'new_sms') {
        window.location.href = `${MOBILE_ENTRY}/messages`;
      }
    });
  } catch (err) {
    console.error('[PlanipretMobile] Push registration error:', err);
  }
}
