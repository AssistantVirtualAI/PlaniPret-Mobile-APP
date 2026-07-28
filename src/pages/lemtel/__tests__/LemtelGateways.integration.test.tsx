/**
 * Integration test — Gateways page merges gateways across ALL domains in the
 * current org, never scoping the FusionPBX proxy call to a single `domain_uuid`.
 *
 * Guards against regressions where the page starts passing `domain_uuid`,
 * which would hide gateways that live under sibling customer domains.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the Supabase client BEFORE importing the page under test.
const invokeMock: any = vi.fn();
const fromMock: any = vi.fn(() => ({
  select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (fn: string, opts: any) => invokeMock(fn, opts) },
    from: (name: string) => fromMock(name),
  },
}));

// Silence toast noise in jsdom.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The permissions help card fetches org context — stub to keep the test focused.
vi.mock('@/components/lemtel/FusionPbxPermissionsHelp', () => ({
  FusionPbxPermissionsHelp: () => null,
}));

import LemtelGateways from '../LemtelGateways';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <LemtelGateways />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockClear();
});

describe('LemtelGateways — cross-domain merge', () => {
  it('invokes list-gateways-merged with NO domain_uuid filter', async () => {
    invokeMock.mockResolvedValue({ data: { data: [] }, error: null });
    renderPage();

    await waitFor(() => expect(invokeMock).toHaveBeenCalled());
    const [fn, opts] = invokeMock.mock.calls[0];
    expect(fn).toBe('fusionpbx-proxy');
    expect(opts.body).toEqual({ action: 'list-gateways-merged' });
    // Explicitly assert the anti-pattern is absent.
    expect(opts.body).not.toHaveProperty('params');
    expect(JSON.stringify(opts.body)).not.toMatch(/domain_uuid/i);
  });

  it('renders gateways merged across multiple domains', async () => {
    invokeMock.mockResolvedValue({
      data: {
        data: [
          {
            gateway_uuid: 'gw-1',
            gateway: 'skyetel',
            proxy: 'sip.skyetel.com',
            context: 'public',
            register: 'true',
            enabled: 'true',
            hostname: 'sip.skyetel.com',
            _domain_name: 'acme.lemtel.io',
          },
          {
            gateway_uuid: 'gw-2',
            gateway: 'voipms',
            proxy: 'toronto.voip.ms',
            context: 'public',
            register: 'true',
            enabled: 'false',
            hostname: 'toronto.voip.ms',
            _domain_name: 'globex.lemtel.io',
          },
          {
            gateway_uuid: 'gw-3',
            gateway: 'twilio-sip',
            proxy: 'ava.pstn.twilio.com',
            context: 'public',
            register: 'false',
            enabled: 'true',
            hostname: 'ava.pstn.twilio.com',
            _domain_name: 'initech.lemtel.io',
          },
        ],
      },
      error: null,
    });

    renderPage();

    // All three gateways from three distinct domains must appear.
    expect(await screen.findByText('skyetel')).toBeInTheDocument();
    expect(await screen.findByText('voipms')).toBeInTheDocument();
    expect(await screen.findByText('twilio-sip')).toBeInTheDocument();

    // Count reflects the merged total (not scoped to any single domain).
    expect(screen.getByText(/3 gateways/i)).toBeInTheDocument();

    // The DB fallback must NOT run when the merged proxy returns rows.
    expect(fromMock).not.toHaveBeenCalledWith('pbx_gateways');
  });
});
