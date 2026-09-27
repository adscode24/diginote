import React from 'react';

interface DigiNoteLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

/**
 * Logo vektor DigiNote: squircle oranye dengan teks "Digital / Note" putih.
 * (Catatan: komponen ini belum dipakai di mana pun; header & Auth memakai /icon.svg langsung.)
 */
export const DigiNoteLogo: React.FC<DigiNoteLogoProps> = ({
  size = 36,
  className = '',
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm select-none rounded-[22%]"
      >
        <rect x="8" y="8" width="496" height="496" rx="118" fill="#EA580C" />
        <text
          x="256"
          y="248"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          fontSize="104"
          fontWeight="800"
          letterSpacing="1"
          fill="#FFFFFF"
        >
          Digital
        </text>
        <text
          x="256"
          y="356"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
          fontSize="100"
          fontWeight="300"
          letterSpacing="6"
          fill="#FFFFFF"
        >
          Note
        </text>
      </svg>

      {showText && (
        <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-0.5">
          <span>DigiNote</span>
        </span>
      )}
    </div>
  );
};
