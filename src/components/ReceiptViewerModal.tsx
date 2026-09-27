import React from 'react';
import { X, Download } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface ReceiptViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  title?: string;
}

export const ReceiptViewerModal: React.FC<ReceiptViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title = 'Bukti Pembayaran',
}) => {
  useBodyScrollLock(isOpen && !!imageUrl);

  if (!isOpen || !imageUrl) return null;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `bukti_transaksi_${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm transition-opacity flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-2xl bg-slate-900 border-t sm:border border-slate-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <h4 className="text-sm font-semibold text-white truncate">{title}</h4>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDownload}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
              title="Unduh Gambar"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 flex items-center justify-center flex-1 overflow-auto bg-black/40">
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[65vh] w-auto object-contain rounded-lg shadow-md"
          />
        </div>
      </div>
    </div>
  );
};
