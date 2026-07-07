'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import { useRevalidator } from 'react-router';

const THRESHOLD = 64; // px to pull before triggering refresh
const MAX_PULL = 80;  // max visual stretch

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const revalidator = useRevalidator();
  const containerRef = useRef<HTMLElement>(null);
  const startYRef = useRef(0);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullingRef = useRef(false);

  const onTouchStart = useCallback((e: TouchEvent) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
    pullingRef.current = true;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    if (!pullingRef.current || refreshing) return;
    const el = containerRef.current;
    if (!el || el.scrollTop > 0) {
      pullingRef.current = false;
      setPullY(0);
      return;
    }
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta <= 0) return;
    // Rubber-band resistance: diminishing returns past threshold
    const clamped = Math.min(MAX_PULL, delta * 0.5);
    setPullY(clamped);
    if (delta > 10) e.preventDefault(); // prevent native scroll while pulling
  }, [refreshing]);

  const onTouchEnd = useCallback(() => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullY >= THRESHOLD * 0.5) {
      setRefreshing(true);
      setPullY(0);
      revalidator.revalidate();
      setTimeout(() => setRefreshing(false), 1200);
    } else {
      setPullY(0);
    }
  }, [pullY, revalidator]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [onTouchStart, onTouchMove, onTouchEnd]);

  return (
    <main ref={containerRef} className="flex-1 overflow-auto pb-20 md:pb-0" style={{ position: 'relative' }}>
      {/* Pull indicator */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-50 flex justify-center overflow-hidden transition-[height] duration-150"
        style={{ height: refreshing ? 40 : pullY > 0 ? pullY : 0 }}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <svg
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            style={{
              transform: refreshing ? undefined : `rotate(${(pullY / MAX_PULL) * 180}deg)`,
              transition: refreshing ? undefined : 'transform 0.1s',
              opacity: refreshing ? 1 : pullY / MAX_PULL,
            }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            {refreshing ? (
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            ) : (
              <path d="M19 9l-7 7-7-7" />
            )}
          </svg>
          <span style={{ opacity: refreshing ? 1 : pullY / MAX_PULL }}>
            {refreshing ? 'Memperbarui...' : 'Tarik untuk refresh'}
          </span>
        </div>
      </div>

      {children}
    </main>
  );
}
