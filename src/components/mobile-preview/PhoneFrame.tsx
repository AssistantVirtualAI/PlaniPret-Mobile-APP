import React from 'react';

interface Props {
  width: number;
  height: number;
  variant?: 'ios' | 'android';
  children: React.ReactNode;
}

export function PhoneFrame({ width, height, variant = 'ios', children }: Props) {
  const bezel = variant === 'ios' ? 14 : 10;
  const radius = variant === 'ios' ? 48 : 36;
  const frameW = width + bezel * 2;
  const frameH = height + bezel * 2;

  return (
    <div
      style={{
        position: 'relative',
        width: frameW,
        height: frameH,
        borderRadius: radius,
        background: 'linear-gradient(160deg, #1a1d24, #0a0c10)',
        padding: bezel,
        boxShadow:
          '0 30px 80px -20px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.04) inset, 0 0 0 1px rgba(0,0,0,0.6)',
      }}
    >
      {/* Side buttons */}
      <div style={{ position: 'absolute', left: -2, top: 110, width: 3, height: 30, background: '#2a2d33', borderRadius: 2 }} />
      <div style={{ position: 'absolute', left: -2, top: 160, width: 3, height: 50, background: '#2a2d33', borderRadius: 2 }} />
      <div style={{ position: 'absolute', left: -2, top: 220, width: 3, height: 50, background: '#2a2d33', borderRadius: 2 }} />
      <div style={{ position: 'absolute', right: -2, top: 170, width: 3, height: 70, background: '#2a2d33', borderRadius: 2 }} />

      <div
        style={{
          position: 'relative',
          width,
          height,
          borderRadius: radius - bezel + 2,
          overflow: 'hidden',
          background: '#000',
        }}
      >
        {children}

        {/* Dynamic island / notch */}
        {variant === 'ios' ? (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 110,
              height: 32,
              background: '#000',
              borderRadius: 20,
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 12,
              height: 12,
              background: '#111',
              border: '1px solid #2a2d33',
              borderRadius: '50%',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
