import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface ToastItem {
  id: number;
  text: string;
}

const ToastContext = createContext<{ pushToast: (text: string) => void } | undefined>(undefined);

let nextId = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const pushToast = useCallback((text: string) => {
    const id = nextId++;
    setToasts(prev => [...prev.slice(-2), { id, text }]);
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timers.current[id];
    }, 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      {/* Toast mengambang di atas dock navigasi */}
      <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none w-full max-w-sm px-4">
        {toasts.map(t => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 text-xs font-semibold shadow-2xl backdrop-blur animate-in slide-in-from-bottom duration-200"
          >
            <CheckCircle2 className="w-4 h-4 text-orange-400 dark:text-orange-600 shrink-0" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
