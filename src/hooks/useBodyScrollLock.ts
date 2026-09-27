import { useEffect } from 'react';

// Counter agar beberapa modal yang bertumpuk tidak saling membuka kunci.
// Dipakai oleh semua bottom sheet / modal overlay.
let activeLocks = 0;

/**
 * Mengunci scroll halaman belakang saat overlay (bottom sheet / modal) terbuka.
 * Perbaiki bug: konten di belakang bottom sheet ikut ter-scroll.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    activeLocks += 1;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      activeLocks = Math.max(0, activeLocks - 1);
      if (activeLocks === 0) {
        document.body.style.overflow = prevOverflow;
        document.body.style.overscrollBehavior = prevOverscroll;
      }
    };
  }, [active]);
}
