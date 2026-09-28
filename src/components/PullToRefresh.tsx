import React, { useState, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<unknown>;
  children: React.ReactNode;
}

const TRIGGER_PX = 70;
const MAX_PULL_PX = 110;

/**
 * Pull-to-refresh khusus sentuhan (mobile/APK): tarik ke bawah saat posisi
 * scroll paling atas untuk menyegarkan data + sinkronisasi cloud.
 * Aman terhadap swipe horizontal (carousel) — hanya merespons tarikan vertikal.
 */
export const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const gesture = useRef<{ startX: number; startY: number; id: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (refreshing) return;
    if (typeof window !== 'undefined' && window.scrollY > 0) return;
    const t = e.touches[0];
    gesture.current = { startX: t.clientX, startY: t.clientY, id: t.identifier };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g || refreshing) return;
    const t = Array.from(e.touches).find(x => x.identifier === g.id) || e.touches[0];
    if (!t) return;
    const dx = t.clientX - g.startX;
    const dy = t.clientY - g.startY;
    // Abaikan gestur horizontal (mis. carousel kartu dana)
    if (Math.abs(dx) > Math.abs(dy)) {
      gesture.current = null;
      setPull(0);
      return;
    }
    if (dy <= 0) {
      setPull(0);
      return;
    }
    setPull(Math.min(dy * 0.5, MAX_PULL_PX));
  };

  const handleTouchEnd = async () => {
    const shouldRefresh = pull >= TRIGGER_PX && !refreshing;
    gesture.current = null;
    if (!shouldRefresh) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    const startedAt = Date.now();
    try {
      await onRefresh();
    } catch {
      /* umpan balik error ditangani pemanggil */
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 600) {
        await new Promise(res => setTimeout(res, 600 - elapsed));
      }
      setRefreshing(false);
      setPull(0);
    }
  };

  const active = refreshing || pull > 0;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* Indikator tarikan */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 z-30 flex flex-col items-center gap-1 transition-opacity"
        style={{
          transform: `translate(-50%, ${refreshing ? 12 : pull - 56}px)`,
          opacity: active ? Math.min(1, pull / TRIGGER_PX + (refreshing ? 1 : 0)) : 0,
        }}
      >
        <span className="w-9 h-9 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center">
          <RefreshCw
            className={`w-4 h-4 text-orange-600 dark:text-orange-400 ${refreshing ? 'animate-spin' : ''}`}
          />
        </span>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded-full backdrop-blur whitespace-nowrap">
          {refreshing ? 'Menyinkronkan…' : pull >= TRIGGER_PX ? 'Lepas untuk sinkron' : 'Tarik untuk sinkron'}
        </span>
      </div>
      {children}
    </div>
  );
};
