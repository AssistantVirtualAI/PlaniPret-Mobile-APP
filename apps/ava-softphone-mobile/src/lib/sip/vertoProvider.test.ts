import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Minimal WebSocket mock that scripts a successful login handshake.
class MockWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen: ((e?: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onerror: ((e?: any) => void) | null = null;
  sent: any[] = [];
  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
    const msg = JSON.parse(data);
    if (msg.method === 'login') {
      setTimeout(() => {
        this.onmessage?.({
          data: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { message: 'logged in', sessid: msg.params.sessid } }),
        });
      }, 0);
    } else if (msg.method === 'verto.invite') {
      // Ack the invite so the outbound call resolves.
      setTimeout(() => {
        this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { message: 'CALL CREATED' } }) });
      }, 0);
    }
  }
  close() { this.readyState = 3; this.onclose?.({ code: 1000 }); }
}

describe('vertoProvider (native WS)', () => {
  beforeEach(() => {
    (globalThis as any).WebSocket = MockWebSocket as any;
    // Provide a minimal RTCPeerConnection so call() doesn't explode. call() is
    // not exercised here (jsdom lacks WebRTC); we only test login.
    vi.resetModules();
  });
  afterEach(() => {
    delete (globalThis as any).WebSocket;
  });

  it('initVerto resolves after login and reports connected', async () => {
    const { initVerto, getVertoClient } = await import('./vertoProvider');
    const client = await initVerto({
      host: 'pbxnode.lemtel.tel', port: 8082,
      login: '113', password: 'secret',
      caller_id_name: 'Mo', caller_id_number: '113',
    });
    expect(client).toBe(getVertoClient());
    expect(client.isConnected()).toBe(true);
  });
});
