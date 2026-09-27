import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Penangkap error render global agar aplikasi tidak blank putih.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : 'Terjadi kesalahan tak terduga',
    };
  }

  componentDidCatch(err: unknown) {
    console.error('App crash:', err);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center space-y-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-xl">
            <img src="/icon.svg" alt="Logo DigiNote" className="w-16 h-16 rounded-2xl mx-auto" />
            <h1 className="text-base font-bold text-slate-900 dark:text-white">
              Aplikasi mengalami gangguan
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white transition"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
