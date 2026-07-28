import React from 'react';

const KEYS: { d: string; sub: string }[] = [
  { d: '1', sub: ' ' },
  { d: '2', sub: 'ABC' },
  { d: '3', sub: 'DEF' },
  { d: '4', sub: 'GHI' },
  { d: '5', sub: 'JKL' },
  { d: '6', sub: 'MNO' },
  { d: '7', sub: 'PQRS' },
  { d: '8', sub: 'TUV' },
  { d: '9', sub: 'WXYZ' },
  { d: '*', sub: '' },
  { d: '0', sub: '+' },
  { d: '#', sub: '' },
];

export default function Dialpad({
  onPress,
  onLongPressZero,
}: {
  onPress: (d: string) => void;
  onLongPressZero?: () => void;
}) {
  const handledRef = React.useRef<number>(0);
  const longTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div style={gridStyle}>
      <style>{dialpadCss}</style>
      {KEYS.map((k) => (
        <button
          key={k.d}
          type="button"
          onPointerDown={(e) => {
            const now = Date.now();
            if (now - handledRef.current < 50) return;
            handledRef.current = now;
            e.preventDefault();
            if (navigator.vibrate) { try { navigator.vibrate(8); } catch { /* noop */ } }
            onPress(k.d);
            if (k.d === '0' && onLongPressZero) {
              longTimerRef.current = setTimeout(() => onLongPressZero(), 600);
            }
          }}
          onPointerUp={() => {
            if (longTimerRef.current) { clearTimeout(longTimerRef.current); longTimerRef.current = null; }
          }}
          onPointerLeave={() => {
            if (longTimerRef.current) { clearTimeout(longTimerRef.current); longTimerRef.current = null; }
          }}
          onClick={(e) => { e.preventDefault(); }}
          className="dialpad-key"
        >
          <span className="dialpad-digit">{k.d}</span>
          {k.sub && <span className="dialpad-sub">{k.sub}</span>}
        </button>
      ))}
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 14,
  padding: '0 24px',
};

const dialpadCss = `
.dialpad-key{
  position:relative;
  width:100%;
  height:64px;
  border-radius:50%;
  aspect-ratio:1/1;
  max-width:64px;
  margin:0 auto;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
  color:var(--text,#fff);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  transition:background .12s ease, transform .08s ease;
  -webkit-tap-highlight-color:transparent;
  user-select:none;
}
.dialpad-key:hover{ background:rgba(255,255,255,.10); }
.dialpad-key:active{
  background:rgba(255,255,255,.18);
  transform:scale(.96);
}
.dialpad-digit{ font-size:28px; font-weight:400; line-height:1; }
.dialpad-sub{ font-size:10px; letter-spacing:2px; color:var(--text-muted,rgba(255,255,255,.55)); margin-top:2px; }
@media (prefers-reduced-motion:reduce){ .dialpad-key{ transition:none; } }
`;
