import React from 'react';
import { Skeleton } from './ui/Primitives';
import { colors, radius, gradients } from '../lib/theme';

/**
 * Generic full-screen skeleton shown while a lazy-loaded screen is fetched
 * or while its first network request resolves. Avoids the blank-screen flash
 * on slow mobile networks.
 */
export default function ScreenSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 14px 20px' }}>
      <div style={{
        marginBottom: 14, padding: 16, borderRadius: radius.xl,
        background: gradients.card, border: `1px solid ${colors.border}`,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <Skeleton w="40%" h={14} />
        <Skeleton w="70%" h={22} />
        <Skeleton w="100%" h={12} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          marginBottom: 10, padding: 14, borderRadius: radius.lg,
          background: gradients.card, border: `1px solid ${colors.border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <Skeleton w={36} h={36} r={18} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton w="55%" h={12} />
            <Skeleton w="35%" h={10} />
          </div>
          <Skeleton w={40} h={10} />
        </div>
      ))}
    </div>
  );
}
