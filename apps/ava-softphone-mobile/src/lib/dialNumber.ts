/**
 * Lance un appel UNIQUEMENT via le softphone SIP intégré.
 * On n'utilise plus jamais le composeur natif (tel:) — toute la voix passe
 * par le canal SIP/WebRTC de l'application pour garantir la qualité audio
 * (noise cancellation, codec Opus FEC/DTX, etc.).
 */
import { showMobileToast } from './mobileToast';
import { txStatic } from './i18n';

export type SoftphoneLike = {
  call?: (n: string) => boolean | void | Promise<boolean>;
  reconnect?: () => void;
  snap?: { status?: string };
};

const sanitize = (raw: string) => raw.replace(/[^\d+*#]/g, '');

export function dialNumber(sp: SoftphoneLike | null | undefined, rawNumber: string | null | undefined): boolean {
  const number = sanitize(String(rawNumber || ''));
  if (!number) {
    showMobileToast(txStatic('Numéro invalide', 'Invalid number'), 'error');
    return false;
  }
  if (!sp || typeof sp.call !== 'function') {
    showMobileToast(txStatic('Téléphone non initialisé', 'Phone not initialized'), 'error');
    return false;
  }
  const status = sp.snap?.status;
  const sipReady = status === 'registered' || status === 'active' || status === 'ringing';
  if (!sipReady) {
    showMobileToast(txStatic('Téléphone non connecté — reconnexion en cours…', 'Phone not connected — reconnecting…'), 'error');
    try { sp.reconnect?.(); } catch {}
    return false;
  }
  try {
    const r = sp.call(number);
    if (r === false) {
      showMobileToast(txStatic("Impossible de lancer l'appel SIP", 'Unable to start SIP call'), 'error');
      return false;
    }
    return true;
  } catch (e: any) {
    showMobileToast(e?.message || txStatic("Échec de l'appel SIP", 'SIP call failed'), 'error');
    return false;
  }
}
