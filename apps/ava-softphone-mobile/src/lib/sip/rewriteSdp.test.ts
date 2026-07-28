/**
 * Unit tests for the FusionPBX SDP rewriter.
 *
 * The fallback rewriter is PCMU-only for codec compatibility, while keeping
 * WebRTC security/ICE lines required by FusionPBX over WSS.
 */
import { describe, it, expect } from 'vitest';
import { rewriteSdpForFusionPBX } from './jssipProvider';

const RAW_SDP = [
  'v=0',
  'o=- 1 1 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'm=audio 49170 UDP/TLS/RTP/SAVPF 111 103 104 9 0 8 106 105 13 110 112 113 126',
  'c=IN IP4 0.0.0.0',
  'a=rtpmap:111 opus/48000/2',
  'a=rtpmap:103 ISAC/16000',
  'a=rtpmap:0 PCMU/8000',
  'a=rtpmap:8 PCMA/8000',
  'a=rtpmap:101 telephone-event/8000',
  'a=fmtp:111 minptime=10;useinbandfec=1',
  'a=fmtp:101 0-16',
  'a=fingerprint:sha-256 AA:BB:CC',
  'a=setup:actpass',
  'a=dtls-id:1',
  'a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:abc',
  'a=ice-ufrag:abc',
  'a=ice-pwd:xyz',
  'a=ice-options:trickle',
  'a=candidate:1 1 udp 2113937151 192.168.1.2 60000 typ host',
  'a=end-of-candidates',
  'a=mid:0',
  'a=msid:stream track',
  'a=ssrc:1234 cname:abc',
  'a=rtcp-fb:111 transport-cc',
  'a=extmap:1 urn:ietf:params:rtp-hdrext:ssrc-audio-level',
  'm=video 49172 UDP/TLS/RTP/SAVPF 96 97',
  'c=IN IP4 0.0.0.0',
  'a=rtpmap:96 VP8/90000',
  'a=fingerprint:sha-256 DD:EE:FF',
].join('\r\n');

describe('rewriteSdpForFusionPBX', () => {
  const out = rewriteSdpForFusionPBX(RAW_SDP);

  it('keeps WebRTC transport and restricts audio to PCMU + telephone-event/8000', () => {
    expect(out).toMatch(/^m=audio \d+ UDP\/TLS\/RTP\/SAVPF 0 101$/m);
  });

  it('removes every m=video section entirely', () => {
    expect(out).not.toMatch(/m=video/);
    expect(out).not.toMatch(/VP8/);
  });

  it('keeps DTLS / SRTP lines', () => {
    expect(out).toMatch(/a=fingerprint/);
    expect(out).toMatch(/a=setup/);
    expect(out).toMatch(/a=dtls-id/);
    expect(out).toMatch(/a=crypto/);
  });

  it('keeps ICE artifacts', () => {
    expect(out).toMatch(/a=ice-ufrag/);
    expect(out).toMatch(/a=ice-pwd/);
    expect(out).toMatch(/a=ice-options/);
    expect(out).toMatch(/a=candidate:/);
    expect(out).toMatch(/a=end-of-candidates/);
  });

  it('keeps only PCMU and telephone-event/8000 rtpmap/fmtp entries', () => {
    const rtpmaps = out.match(/^a=rtpmap:(\d+) /gm) || [];
    const pts = rtpmaps.map((l) => l.match(/^a=rtpmap:(\d+) /)![1]);
    expect(new Set(pts)).toEqual(new Set(['0', '101']));
    expect(out).not.toMatch(/a=rtpmap:111/);
    expect(out).not.toMatch(/a=fmtp:111/);
  });

  it('keeps WebRTC media metadata but drops rtcp-fb for removed codecs', () => {
    expect(out).not.toMatch(/a=rtcp-fb/);
    expect(out).toMatch(/a=extmap/);
    expect(out).toMatch(/a=msid/);
    expect(out).toMatch(/a=ssrc/);
    expect(out).toMatch(/a=mid:/);
  });
});
