/**
 * Tiny in-app router used by notification taps (bell + native push + local
 * notifications). Dispatches a window event that MobileApp listens to and
 * translates into (tab, sub-tab) state.
 */
export type AppRoute =
  | { tab: 'calls'; sub?: 'recents' | 'recordings' | 'voicemail' | 'dial'; filter?: 'all' | 'missed' }
  | { tab: 'voicemail' }
  | { tab: 'sms' }
  | { tab: 'messages' }
  | { tab: 'chats' }
  | { tab: 'home' }
  | { tab: 'ava' }
  | { tab: 'keypad' }
  | { tab: 'contacts' }
  | { tab: 'settings' }
  | { tab: 'more' };

export const NAV_EVENT = 'ava:navigate';

export function navigateTo(route: AppRoute) {
  window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: route }));
}

export function onNavigate(handler: (r: AppRoute) => void): () => void {
  const fn = (e: Event) => {
    const detail = (e as CustomEvent).detail as AppRoute | undefined;
    if (detail && detail.tab) handler(detail);
  };
  window.addEventListener(NAV_EVENT, fn as EventListener);
  return () => window.removeEventListener(NAV_EVENT, fn as EventListener);
}
