/**
 * Real-time call quality sampler driven by RTCPeerConnection.getStats().
 *
 * Reports rolling RTT, jitter, packet loss % and a 0-4 "bars" level for the
 * UI gauge. Used by the adaptive bitrate loop and by CallQualityGauge.
 */
export interface CallQuality {
  /** round-trip time in ms (-1 = unknown) */
  rtt: number;
  /** inbound jitter in ms */
  jitter: number;
  /** packet loss percentage (0-100) over the last sampling window */
  lossPct: number;
  /** 0 (no signal) … 4 (excellent) */
  level: 0 | 1 | 2 | 3 | 4;
  /** epoch ms of the last sample */
  at: number;
}

export const EMPTY_QUALITY: CallQuality = {
  rtt: -1, jitter: 0, lossPct: 0, level: 4, at: 0,
};

export function scoreLevel(q: { rtt: number; jitter: number; lossPct: number }): CallQuality['level'] {
  // Worst-of-three scoring. Thresholds tuned for voice (Opus).
  const lossBand =
    q.lossPct >= 10 ? 0 :
    q.lossPct >= 5  ? 1 :
    q.lossPct >= 2  ? 2 :
    q.lossPct >= 0.5 ? 3 : 4;
  const jitterBand =
    q.jitter >= 80 ? 0 :
    q.jitter >= 40 ? 1 :
    q.jitter >= 20 ? 2 :
    q.jitter >= 10 ? 3 : 4;
  const rttBand =
    q.rtt < 0 ? 4 :
    q.rtt >= 600 ? 0 :
    q.rtt >= 400 ? 1 :
    q.rtt >= 250 ? 2 :
    q.rtt >= 150 ? 3 : 4;
  return Math.min(lossBand, jitterBand, rttBand) as CallQuality['level'];
}

export interface SamplerState {
  prevPacketsLost?: number;
  prevPacketsReceived?: number;
}

/**
 * Sample one snapshot of audio quality from a peer connection.
 * Caller keeps the SamplerState so we can compute deltas across calls.
 */
export async function sampleCallQuality(
  pc: RTCPeerConnection,
  state: SamplerState,
): Promise<CallQuality> {
  let rtt = -1, jitter = 0;
  let packetsLost = 0, packetsReceived = 0;
  try {
    const stats: any = await pc.getStats();
    stats.forEach((r: any) => {
      if (r.type === 'inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) {
        jitter = Math.max(jitter, Math.round(((r.jitter || 0) * 1000)));
        packetsLost += Number(r.packetsLost || 0);
        packetsReceived += Number(r.packetsReceived || 0);
      } else if (r.type === 'remote-inbound-rtp' && (r.kind === 'audio' || r.mediaType === 'audio')) {
        if (typeof r.roundTripTime === 'number') rtt = Math.max(rtt, Math.round(r.roundTripTime * 1000));
      } else if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
        if (typeof r.currentRoundTripTime === 'number') {
          const ms = Math.round(r.currentRoundTripTime * 1000);
          if (rtt < 0 || ms < rtt) rtt = ms;
        }
      }
    });
  } catch {/* ignore */}

  // Compute loss % over the delta window.
  const dLost = Math.max(0, packetsLost - (state.prevPacketsLost ?? packetsLost));
  const dRecv = Math.max(0, packetsReceived - (state.prevPacketsReceived ?? packetsReceived));
  state.prevPacketsLost = packetsLost;
  state.prevPacketsReceived = packetsReceived;
  const denom = dLost + dRecv;
  const lossPct = denom > 0 ? (dLost / denom) * 100 : 0;

  return {
    rtt, jitter, lossPct: Math.round(lossPct * 10) / 10,
    level: scoreLevel({ rtt, jitter, lossPct }),
    at: Date.now(),
  };
}

/**
 * Decide the Opus sender max-bitrate to apply for the next window given the
 * recent quality sample and current profile cap.
 */
export function chooseAdaptiveBitrate(q: CallQuality, hardCap: number, current: number): number {
  // Floor: 10 kbps (Opus narrowband intelligibility limit with FEC).
  const FLOOR = 10000;
  if (q.lossPct >= 10 || q.level === 0) return Math.max(FLOOR, Math.min(current, 12000));
  if (q.lossPct >= 5  || q.level === 1) return Math.max(FLOOR, Math.min(current, 16000));
  if (q.lossPct >= 2  || q.level === 2) return Math.min(hardCap, 20000);
  if (q.lossPct >= 0.5 || q.level === 3) return Math.min(hardCap, 24000);
  // Excellent: ramp back to cap.
  return hardCap;
}
