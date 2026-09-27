import React from 'react';

interface DigiNoteLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
}

export const DigiNoteLogo: React.FC<DigiNoteLogoProps> = ({
  size = 36,
  className = '',
  showText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* Icon Squircle */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-sm select-none"
      >
        <defs>
          {/* Main Orange Gradient for App Icon (DigiNote brand #EA580C) */}
          <linearGradient id="diginoteIconGrad" x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="55%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#EA580C" />
          </linearGradient>

          {/* Phone Screen Gradient */}
          <linearGradient id="phoneScreenGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#D5DEE8" />
          </linearGradient>

          {/* Drop shadow for bill and phone */}
          <filter id="diginoteElementShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000000" floodOpacity="0.22" />
          </filter>
        </defs>

        {/* Squircle Background Container */}
        <rect width="512" height="512" rx="120" fill="url(#diginoteIconGrad)" />

        {/* 1. Banknote / Uang Kertas (Tilted to the left) */}
        <g transform="translate(205, 175) rotate(-16)" filter="url(#diginoteElementShadow)">
          {/* Outer white outline/body */}
          <rect
            x="-72"
            y="-48"
            width="144"
            height="96"
            rx="14"
            fill="#FFE7D0"
            stroke="#FFFFFF"
            strokeWidth="10"
          />
          {/* Inner dash border */}
          <rect
            x="-60"
            y="-36"
            width="120"
            height="72"
            rx="8"
            fill="none"
            stroke="#FFA86B"
            strokeWidth="3.5"
            strokeDasharray="8 5"
          />
          {/* Center currency emblem circle */}
          <circle cx="0" cy="0" r="20" fill="#FF9147" />
          <circle cx="0" cy="0" r="13" fill="#FFE7D0" />
          <circle cx="0" cy="0" r="7" fill="#FF9147" />
          {/* Corner currency dots */}
          <circle cx="-46" cy="-22" r="5" fill="#FFA86B" />
          <circle cx="46" cy="22" r="5" fill="#FFA86B" />
        </g>

        {/* 2. Smartphone (Standing upright on right) */}
        <g transform="translate(306, 170) rotate(1.5)" filter="url(#diginoteElementShadow)">
          {/* Phone White Body */}
          <rect
            x="-44"
            y="-68"
            width="88"
            height="136"
            rx="18"
            fill="#FFFFFF"
            stroke="#FFFFFF"
            strokeWidth="4"
          />
          {/* Phone Screen */}
          <rect
            x="-36"
            y="-52"
            width="72"
            height="102"
            rx="9"
            fill="url(#phoneScreenGrad)"
          />
          {/* Top Speaker Slit */}
          <rect x="-10" y="-61" width="20" height="3.5" rx="1.75" fill="#9DAEC0" />
          {/* Top Camera Dot */}
          <circle cx="-18" cy="-59" r="2.5" fill="#718295" />
        </g>

        {/* 3. Bold White Lowercase 'n' (Foreground) */}
        <path
          d="M 206 370 L 206 242 C 206 198 238 180 264 180 C 294 180 318 198 318 242 L 318 370"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="56"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Optional Wordmark matching the image's logo text */}
      {showText && (
        <span className="text-lg font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-0.5">
          <span>DigiNote</span>
        </span>
      )}
    </div>
  );
};
