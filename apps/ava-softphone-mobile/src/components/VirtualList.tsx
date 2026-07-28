/**
 * VirtualList — windowing minimal sans dépendance externe.
 *
 * Adapté aux listes longues (messages, contacts, récents). Calcule la
 * fenêtre visible à partir du scroll du conteneur et n'affiche que les
 * lignes pertinentes (+ un overscan pour la fluidité du défilement).
 *
 * Limitation volontaire : hauteur de ligne fixe (`itemHeight`). Pour les
 * cas dynamiques, mesurer la hauteur réelle d'une rangée témoin et la
 * passer ici. C'est suffisant pour 95% des écrans mobiles.
 */
import React, { useEffect, useRef, useState } from 'react';

export type VirtualListProps<T> = {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
  keyOf?: (item: T, index: number) => string | number;
  ariaLabel?: string;
};

export function VirtualList<T>({
  items,
  itemHeight,
  renderItem,
  overscan = 6,
  height = '100%',
  className,
  style,
  keyOf,
  ariaLabel,
}: VirtualListProps<T>) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const update = () => setViewport(el.clientHeight);
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, []);

  const total = items.length;
  const totalHeight = total * itemHeight;
  const visibleCount = Math.ceil((viewport || 0) / itemHeight) + overscan * 2;
  const startIdx = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIdx = Math.min(total, startIdx + visibleCount);
  const offsetY = startIdx * itemHeight;

  return (
    <div
      ref={scrollRef}
      role="list"
      aria-label={ariaLabel}
      className={className}
      style={{ overflowY: 'auto', height, position: 'relative', ...style }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)`, position: 'absolute', left: 0, right: 0, top: 0 }}>
          {items.slice(startIdx, endIdx).map((item, i) => {
            const idx = startIdx + i;
            const k = keyOf ? keyOf(item, idx) : idx;
            return (
              <div key={k} role="listitem" style={{ height: itemHeight }}>
                {renderItem(item, idx)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default VirtualList;
