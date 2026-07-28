/**
 * Verifies every sheet-opening Settings row is tappable and opens the
 * correct in-app sheet (Ringtone, Audio output, Forwarding, Clear cache).
 * Also verifies Wi-Fi/LTE chip renders from the live network listener.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---- Mocks --------------------------------------------------------------
vi.mock('../lib/mobileApi', () => ({
  mobileApi: {
    me: vi.fn().mockResolvedValue({
      user: { name: 'Test User' },
      extension: { number: '300', sipDomain: 'lemtel.tel' },
      domain: { sipDomain: 'lemtel.tel' },
      organization: { name: 'Lemtel' },
      status: { doNotDisturb: false, forwarding: null },
      permissions: { admin: false, canManageUsers: false, canManageNumbers: false, canManageRouting: false, canManageAgents: false },
      role: 'agent',
      dataScope: 'own',
    }),
    setDnd: vi.fn().mockResolvedValue(undefined),
    setForwarding: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../lib/permissions', () => ({
  checkAllPermissions: vi.fn().mockResolvedValue({ microphone: 'granted', speaker: 'granted', contacts: 'granted', notifications: 'granted' }),
  openAppSettings: vi.fn(),
}));
vi.mock('../lib/recordingConsent', () => ({
  getAnnounceConsent: () => true,
  setAnnounceConsent: vi.fn(),
}));
vi.mock('../lib/sip/audioOutput', () => ({
  setRoute: vi.fn().mockResolvedValue(true),
}));
const capListeners: Array<(s: any) => void> = [];
vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: vi.fn().mockResolvedValue({ connected: true, connectionType: 'wifi' }),
    addListener: vi.fn().mockImplementation((_evt: string, cb: (s: any) => void) => {
      capListeners.push(cb);
      return Promise.resolve({ remove: () => Promise.resolve() });
    }),
  },
}));

import SettingsScreen from '../screens/SettingsScreen';
import { ThemeProvider } from '../lib/ThemeContext';
import { MobileI18nProvider as LangProvider } from '../lib/i18n';

const creds: any = { extension: '300', displayName: 'Test', email: 't@x.com', sipDomain: 'lemtel.tel', role: 'agent' };
const sp: any = { snap: { status: 'registered' }, sipConfig: { wssUrl: 'wss://x' }, sipLog: [], reconnect: vi.fn(), clearSipState: vi.fn() };

function renderScreen() {
  return render(
    <ThemeProvider>
      <LangProvider>
        <SettingsScreen creds={creds} sp={sp} onSignOut={() => {}} />
      </LangProvider>
    </ThemeProvider>
  );
}

beforeEach(() => { capListeners.length = 0; localStorage.clear(); });

describe('SettingsScreen — rows & sheets', () => {
  it('opens the Ringtone sheet when the row is tapped', async () => {
    renderScreen();
    const row = await screen.findByText(/^(Ringtone|Sonnerie)$/i);
    fireEvent.click(row);
    await waitFor(() => expect(screen.getAllByText(/AVA Default/i).length).toBeGreaterThan(1));
  });

  it('opens the Audio output sheet with all route choices', async () => {
    renderScreen();
    const row = await screen.findByText(/^(Audio output|Sortie audio)$/i);
    fireEvent.click(row);
    await waitFor(() => {
      expect(screen.getByText(/^(Earpiece|Écouteur)$/i)).toBeDefined();
      expect(screen.getByText(/Bluetooth/i)).toBeDefined();
    });
  });

  it('opens the Forwarding sheet and shows a phone input', async () => {
    renderScreen();
    const row = await screen.findByText(/Call forwarding|Transfert d'appel/i);
    fireEvent.click(row);
    await waitFor(() => {
      const input = document.querySelector('input[type="tel"]') as HTMLInputElement;
      expect(input).toBeTruthy();
    });
  });

  it('opens the Clear cache confirmation sheet', async () => {
    renderScreen();
    const row = await screen.findByText(/Clear app cache|Vider le cache/i);
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText(/AI summaries|résumés IA/i)).toBeDefined());
  });

  it('persists noise-cancellation preference to localStorage', async () => {
    renderScreen();
    const row = await screen.findByText(/Noise cancel|Réduction/i);
    fireEvent.click(row);
    await waitFor(() => expect(localStorage.getItem('ava.nc_enabled')).toBe('off'));
  });

  it('updates the network chip when Capacitor Network fires networkStatusChange', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getAllByText(/Wi-Fi/i).length).toBeGreaterThan(0));
    await act(async () => {
      capListeners.forEach((cb) => cb({ connected: true, connectionType: 'cellular' }));
    });
    await waitFor(() => expect(screen.getAllByText(/LTE|Cellular/i).length).toBeGreaterThan(0));
  });
});
