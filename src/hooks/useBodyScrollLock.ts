import { useEffect, useId } from 'react';

// Registry ID overlay yang sedang mengunci (lebih aman dari counter:
// tidak bisa macet di angka >0 bila cleanup terlewat).
const locks = new Set<string>();
let originalOverflow: string | null = null;
let originalOverscroll: string | null = null;

function applyLock() {
  if (originalOverflow === null) {
    originalOverflow = document.body.style.overflow;
    originalOverscroll = document.body.style.overscrollBehavior;
  }
  document.body.style.overflow = 'hidden';
  document.body.style.overscrollBehavior = 'none';
}

function releaseLock() {
  if (originalOverflow !== null) {
    document.body.style.overflow = originalOverflow;
    document.body.style.overscrollBehavior = originalOverscroll ?? '';
    originalOverflow = null;
    originalOverscroll = null;
  } else {
    document.body.style.overflow = '';
    document.body.style.overscrollBehavior = '';
  }
}

/**
 * Mengunci scroll halaman belakang saat overlay (bottom sheet / modal) terbuka.
 * Perbaiki bug: konten di belakang bottom sheet ikut ter-scroll.
 */
export function useBodyScrollLock(active: boolean) {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    const wasEmpty = locks.size === 0;
    locks.add(id);
    if (wasEmpty) applyLock();
    return () => {
      locks.delete(id);
      if (locks.size === 0) releaseLock();
    };
  }, [active, id]);
}

/**
 * Darurat: paksa buka kunci scroll (dipanggil saat pindah halaman —
 * tidak ada modal yang bisa terbuka saat navigasi, jadi ini selalu aman).
 * Menyembuhkan halaman yang macet tidak bisa scroll.
 */
export function forceUnlockBodyScroll() {
  locks.clear();
  releaseLock();
}
