/**
 * Audio profiles for the in-app SIP softphone.
 *
 *   hd            — full quality (default on WiFi)
 *   auto          — adaptive: starts HD, downshifts based on packet loss
 *   low-bandwidth — forced low bitrate, robust on 2G/3G or congested links
 *
 * Each profile drives both the Opus fmtp in the SDP and the runtime
 * sender.maxBitrate cap used by the adaptive loop.
 */
export type AudioProfile = 'hd' | 'auto' | 'low-bandwidth';

export interface OpusParams {
  /** target average bitrate in bps */
  maxAverageBitrate: number;
  /** ceiling for setParameters().maxBitrate in bps */
  hardCapBitrate: number;
  maxPlaybackRate: number;
  useInbandFec: boolean;
  useDtx: boolean;
  /** initial packetization in ms (higher = smaller overhead, more latency) */
  ptime: number;
}

export const PROFILE_OPUS: Record<AudioProfile, OpusParams> = {
  hd: {
    maxAverageBitrate: 32000,
    hardCapBitrate: 40000,
    maxPlaybackRate: 16000,
    useInbandFec: true,
    useDtx: true,
    ptime: 20,
  },
  auto: {
    maxAverageBitrate: 24000,
    hardCapBitrate: 32000,
    maxPlaybackRate: 16000,
    useInbandFec: true,
    useDtx: true,
    ptime: 20,
  },
  'low-bandwidth': {
    // Opus is intelligible from ~10 kbps; we cap at 12 kbps narrowband
    // with longer 40 ms frames + FEC for resilience.
    maxAverageBitrate: 12000,
    hardCapBitrate: 16000,
    maxPlaybackRate: 8000,
    useInbandFec: true,
    useDtx: true,
    ptime: 40,
  },
};

const KEY = 'ava.audioProfile.v1';

export function loadAudioProfile(): AudioProfile {
  try {
    const v = (typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) as AudioProfile | null;
    if (v === 'hd' || v === 'auto' || v === 'low-bandwidth') return v;
  } catch {}
  return 'auto';
}

export function saveAudioProfile(p: AudioProfile) {
  try { localStorage.setItem(KEY, p); } catch {}
}
