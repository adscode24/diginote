import React from 'react';

interface DigiNoteLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * Logo DigiNote: memakai /icon.svg (satu-satunya sumber logo) agar selalu
 * sama dengan ikon aplikasi/APK.
 * (Catatan: komponen ini belum dipakai di mana pun; header & Auth memakai /icon.svg langsung.)
 */
export const DigiNoteLogo: React.FC<DigiNoteLogoProps> = ({
  size = 36,
  className = '',
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/icon.svg"
        alt="Logo DigiNote"
        width={size}
        height={size}
        className="shrink-0 drop-shadow-sm select-none rounded-[22%]"
      />

      {showText && (
        <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-0.5">
          <span>DigiNote</span>
        </span>
      )}
    </div>
  );
};
