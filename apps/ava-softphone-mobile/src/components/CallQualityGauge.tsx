import React from 'react';
import type { CallQuality } from '../lib/sip/callQuality';
import type { AudioProfile } from '../lib/sip/audioProfile';
import { colors } from '../lib/theme';

const PROFILE_LABELS: Record<AudioProfile, string> = {
  hd: 'HD',
  auto: 'AUTO',
  'low-bandwidth': 'LOW BW',
};

function tone(level: CallQuality['level']) {
  if (level <= 1) return colors.danger;
  if (level === 2) return colors.warning;
  if (level === 3) return colors.signalGold || colors.warning;
  return colors.success;
}

export default function CallQualityGauge({
  quality,
  profile,
  onCycleProfile,
}: {
  quality: CallQuality;
  profile: AudioProfile;
  onCycleProfile?: () => void;
}) {
  const c = tone(quality.level);
  const bars = [0, 1, 2, 3].map((i) => i < quality.level);
  return (
    <button
      onClick={onCycleProfile}
      title={`RTT ${quality.rtt < 0 ? '—' : quality.rtt + 'ms'} · Jitter ${quality.jitter}ms · Loss ${quality.lossPct}% · Tap to switch profile`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 10px', borderRadius: 999,
        background: 'rgba(255,255,255,0.06)',
        border: `1px solid ${c}55`,
        color: colors.textIce, cursor: onCycleProfile ? 'pointer' : 'default',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700,
        letterSpacing: 1,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 12 }}>
        {bars.map((on, i) => (
          <span key={i} style={{
            width: 3, height: 4 + i * 2,
            background: on ? c : 'rgba(255,255,255,0.18)',
            borderRadius: 1,
          }} />
        ))}
      </span>
      <span style={{ color: c }}>{PROFILE_LABELS[profile]}</span>
      <span style={{ color: colors.mutedSilver }}>
        {quality.rtt < 0 ? '—' : `${quality.rtt}ms`} · {quality.lossPct}%
      </span>
    </button>
  );
}
