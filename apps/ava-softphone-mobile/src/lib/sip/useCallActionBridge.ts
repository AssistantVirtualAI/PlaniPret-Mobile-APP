import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
// AndroidSipServicePlugin is the real CapacitorPjsip bridge already registered
// in nativeSipProvider.ts. We import it directly to avoid calling registerPlugin()
// a second time (which would throw "already registered").
import { AndroidSipServicePlugin } from './nativeSipProvider';

type CallAction = 'answer' | 'decline' | 'hangup' | 'hold' | 'resume' | 'mute';

interface Handlers {
  onAnswer?: () => void;
  onDecline?: () => void;
  onHangup?: () => void;
  onHold?: () => void;
  onResume?: () => void;
  onMute?: () => void;
}

/**
 * Registers listeners for native call-action events:
 *  - Android: `sipCallAction` from the already-registered CapacitorPjsip bridge
 *    (fired by CallActionReceiver → ACTION_CALL_ACTION_EVENT broadcast).
 *  - iOS: `sipCallAction` from CapacitorSip (CallKit callbacks).
 *  - Web/fallback: `sip:callAction` window CustomEvent.
 */
export function useCallActionBridge(handlers: Handlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const cleanups: Array<() => void> = [];

    const dispatch = (action: CallAction) => {
      switch (action) {
        case 'answer':  handlers.onAnswer?.(); break;
        case 'decline': (handlers.onDecline ?? handlers.onHangup)?.(); break;
        case 'hangup':  (handlers.onHangup ?? handlers.onDecline)?.(); break;
        case 'hold':    handlers.onHold?.(); break;
        case 'resume':  handlers.onResume?.(); break;
        case 'mute':    handlers.onMute?.(); break;
      }
    };

    const platform = Capacitor.getPlatform();

    if (platform === 'android') {
      // AndroidSipServicePlugin is the real CapacitorPjsip bridge (registered once
      // in nativeSipProvider.ts). Its addListener method relays the native
      // ACTION_CALL_ACTION_EVENT broadcast → JS `sipCallAction` event.
      const plugin = AndroidSipServicePlugin as any;
      if (typeof plugin?.addListener === 'function') {
        plugin.addListener('sipCallAction', (evt: { action: CallAction }) => {
          if (evt?.action) dispatch(evt.action);
        }).then((handle: any) => {
          if (handle?.remove) cleanups.push(() => handle.remove());
        }).catch((e: any) => {
          console.warn('[useCallActionBridge] android addListener failed:', e);
        });
      }
    }

    if (platform === 'ios') {
      // iOS only: CapacitorSip relays CallKit taps. Safe to registerPlugin here
      // because CapacitorSip is NOT registered anywhere else on iOS.
      try {
        const { registerPlugin } = require('@capacitor/core');
        const IosPlugin: any = registerPlugin('CapacitorSip');
        const sub = IosPlugin?.addListener?.('sipCallAction', (evt: { action: CallAction }) => {
          if (evt?.action) dispatch(evt.action);
        });
        if (sub && typeof sub.then === 'function') {
          sub.then((handle: any) => { if (handle?.remove) cleanups.push(() => handle.remove()); });
        } else if (sub?.remove) {
          cleanups.push(() => sub.remove());
        }
      } catch (e) {
        console.warn('[useCallActionBridge] iOS CapacitorSip listener failed:', e);
      }
    }

    // Web / cross-platform fallback — fires even if Capacitor plugins fail.
    const winHandler = (e: any) => {
      const action = e?.detail?.action as CallAction | undefined;
      if (action) dispatch(action);
    };
    window.addEventListener('sip:callAction', winHandler as EventListener);
    cleanups.push(() => window.removeEventListener('sip:callAction', winHandler as EventListener));

    return () => { cleanups.forEach((fn) => { try { fn(); } catch {} }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}
