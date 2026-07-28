import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { getPermState, requestPerm, openAppSettings, type PermKey, type PermState } from '../lib/permissionState';

/**
 * Unified permission hook — mirrors the Expo `usePermissions` contract but
 * built on top of Capacitor. Exposes GRANTED / DENIED / BLOCKED / UNAVAILABLE
 * for microphone and contacts (+ notifications), and safe request helpers.
 */
export function usePermissions() {
  const [micStatus, setMic] = useState<PermState>('unknown');
  const [contactsStatus, setContacts] = useState<PermState>('unknown');
  const [notifStatus, setNotif] = useState<PermState>('unknown');

  const refresh = useCallback(async () => {
    const [m, c, n] = await Promise.all([
      getPermState('microphone'),
      getPermState('contacts'),
      getPermState('notifications'),
    ]);
    setMic(m); setContacts(c); setNotif(n);
  }, []);

  useEffect(() => {
    void refresh();
    if (!Capacitor.isNativePlatform()) return;
    const onVis = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVis);
    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const h = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh(); });
        cleanup = () => { try { h.remove(); } catch {} };
      } catch { /* ignore */ }
    })();
    return () => { document.removeEventListener('visibilitychange', onVis); cleanup?.(); };
  }, [refresh]);

  const request = useCallback(async (key: PermKey) => {
    const s = await requestPerm(key);
    if (key === 'microphone') setMic(s);
    if (key === 'contacts') setContacts(s);
    if (key === 'notifications') setNotif(s);
    return s;
  }, []);

  return {
    micStatus,
    contactsStatus,
    notifStatus,
    requestMicrophonePermission: () => request('microphone'),
    requestContactsPermission: () => request('contacts'),
    requestNotificationsPermission: () => request('notifications'),
    openSettings: openAppSettings,
    refresh,
  };
}
