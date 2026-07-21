/**
 * Planiprêt Mobile — Standalone Capacitor app entry
 */
import React from 'react';
import { render as legacyRender } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import App from './App';
import './styles.css';

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
  const isNativeShell = () => {
    try { return Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:'; }
    catch { return window.location.protocol === 'capacitor:'; }
  };

  // iOS WKWebView can throw an empty native Error while React installs its
  // delegated event listeners during createRoot(). If that bubbles, startup
  // stops inside vendor-react before the first screen renders. Ignore only the
  // known empty/UNIMPLEMENTED native artifacts and let real app errors through.
  try {
    const proto = (globalThis as any).EventTarget?.prototype as {
      addEventListener?: EventTarget['addEventListener'];
      removeEventListener?: EventTarget['removeEventListener'];
      __ppSafeAddEventListener?: boolean;
    } | undefined;
    if (proto?.addEventListener && !proto.__ppSafeAddEventListener) {
      const originalAdd = proto.addEventListener;
      const originalRemove = proto.removeEventListener;
      const fnWrappers = new WeakMap<EventListener, EventListener>();
      const objWrappers = new WeakMap<EventListenerObject, EventListenerObject>();
      const wrapListener = (listener: EventListenerOrEventListenerObject | null): EventListenerOrEventListenerObject | null => {
        if (!listener || !isNativeShell()) return listener;
        if (typeof listener === 'function') {
          const existing = fnWrappers.get(listener as EventListener);
          if (existing) return existing;
          const wrapped: EventListener = function (this: EventTarget, event: Event) {
            try {
              return (listener as EventListener).call(this, event);
            } catch (error) {
              if (isIgnorableNativeStartupError(error)) {
                console.warn('[PP] swallowed native listener artifact', event.type);
                return undefined;
              }
              throw error;
            }
          };
          fnWrappers.set(listener as EventListener, wrapped);
          return wrapped;
        }
        if (typeof (listener as EventListenerObject).handleEvent === 'function') {
          const existing = objWrappers.get(listener as EventListenerObject);
          if (existing) return existing;
          const wrapped: EventListenerObject = {
            handleEvent(event: Event) {
              try {
                return (listener as EventListenerObject).handleEvent(event);
              } catch (error) {
                if (isIgnorableNativeStartupError(error)) {
                  console.warn('[PP] swallowed native handleEvent artifact', event.type);
                  return undefined;
                }
                throw error;
              }
            },
          };
          objWrappers.set(listener as EventListenerObject, wrapped);
          return wrapped;
        }
        return listener;
      };
      const unwrapListener = (listener: EventListenerOrEventListenerObject | null): EventListenerOrEventListenerObject | null => {
        if (!listener) return listener;
        return (
          (typeof listener === 'function' ? fnWrappers.get(listener as EventListener) : objWrappers.get(listener as EventListenerObject)) ??
          listener
        );
      };
      proto.addEventListener = function patchedAddEventListener(type, listener, options) {
        try {
          return originalAdd.call(this, type, wrapListener(listener), options);
        } catch (error) {
          if (isNativeShell() && isIgnorableNativeStartupError(error)) return undefined;
          throw error;
        }
      } as typeof proto.addEventListener;
      if (originalRemove) {
        proto.removeEventListener = function patchedRemoveEventListener(type, listener, options) {
          return originalRemove.call(this, type, unwrapListener(listener), options);
        } as typeof proto.removeEventListener;
      }
      proto.__ppSafeAddEventListener = true;
    }
  } catch {}

  window.addEventListener('error', (event) => {
    if (!isIgnorableNativeStartupError((event as ErrorEvent).error)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    if (!isIgnorableNativeStartupError(event.reason)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

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
    const container = document.getElementById('root');
    if (!container) throw new Error('Root element not found');
    (window as any).__PP_REACT_BOOT_ATTEMPTED__ = true;
    if (container.textContent?.trim() === 'Démarrage...') container.innerHTML = '';
    const appTree = (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // iOS Capacitor is crashing inside React 18's createRoot event bootstrap
    // before the first commit (vendor-react line in Xcode). Native shells do
    // not need concurrent rendering here, so use the React 17-compatible mount
    // path for Capacitor only and keep createRoot for web/dev preview.
    if (Capacitor.isNativePlatform() || window.location.protocol === 'capacitor:') {
      legacyRender(appTree, container);
      window.setTimeout(() => { (window as any).__PP_REACT_BOOTED__ = true; }, 0);
      return;
    }

    // React.StrictMode intentionally double-mounts components in development,
    // which triggers error boundaries with empty errors on Capacitor iOS.
    // We disable it unconditionally in this native build.
    const root = createRoot(container, {
      onRecoverableError(error) {
        if (isIgnorableNativeStartupError(error)) return;
        console.error('[PP] React recoverable error:', error);
      },
    });
    root.render(appTree);
    window.setTimeout(() => { (window as any).__PP_REACT_BOOTED__ = true; }, 0);
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
  } catch {}
}, 3000);

bootstrap().catch((e) => console.error('[PP] bootstrap crashed:', e));
