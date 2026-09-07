import { useId } from "react";

type MagicCoinIconProps = {
  className?: string;
  title?: string;
};

/** Emerald clover coin used for agent-earned in-app currency. */
export function MagicCoinIcon({ className = "", title = "Magic Coin" }: MagicCoinIconProps) {
  const iconId = useId().replace(/:/g, "");
  const faceId = `magic-coin-face-${iconId}`;
  const rimId = `magic-coin-rim-${iconId}`;
  const glowId = `magic-coin-glow-${iconId}`;

  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={faceId} x1="6" y1="4" x2="27" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d9ff85" />
          <stop offset="0.46" stopColor="#5edb5b" />
          <stop offset="1" stopColor="#087c55" />
        </linearGradient>
        <linearGradient id={rimId} x1="4" y1="3" x2="29" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff4a8" />
          <stop offset="0.35" stopColor="#d4a93e" />
          <stop offset="1" stopColor="#7a4812" />
        </linearGradient>
        <filter id={glowId} x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="1.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [data-magic-coin-sparkle] animate { display: none; }
        }
      `}</style>
      <circle cx="16" cy="16" r="14" fill={`url(#${rimId})`} />
      <circle
        cx="16"
        cy="16"
        r="11.5"
        fill={`url(#${faceId})`}
        stroke="#e6ffbc"
        strokeOpacity="0.65"
      />
      <path
        d="M16 12.5C13.2 6.9 7.2 9.2 8.1 13.9c.8 4.3 5.1 4.7 7.9 7.6 2.8-2.9 7.1-3.3 7.9-7.6.9-4.7-5.1-7-7.9-1.4Z"
        fill="#0d8c54"
        stroke="#063f32"
        strokeWidth="1.15"
      />
      <path
        d="M16 12.5v9M16 16.7l-4.2-3M16 16.7l4.2-3"
        stroke="#d9ff87"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
      <g data-magic-coin-sparkle="primary" filter={`url(#${glowId})`}>
        <g transform="translate(8.6 8.4)">
          <path
            d="M0-2.8.68-.68 2.8 0 .68.68 0 2.8l-.68-2.12L-2.8 0l2.12-.68L0-2.8Z"
            fill="#fff7ba"
          >
            <animate
              attributeName="opacity"
              values=".35;1;.48;.35"
              dur="1.65s"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="scale"
              values=".62;.62;1.18;.86;.62"
              keyTimes="0;.28;.5;.72;1"
              dur="1.65s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      </g>
      <g data-magic-coin-sparkle="lower" filter={`url(#${glowId})`}>
        <g transform="translate(24.2 22.5)">
          <path
            d="M0-1.7.42-.42 1.7 0l-1.28.42L0 1.7l-.42-1.28L-1.7 0l1.28-.42L0-1.7Z"
            fill="#ffd45c"
          >
            <animate
              attributeName="opacity"
              values=".28;.78;1;.28"
              dur="1.9s"
              begin=".55s"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="scale"
              values=".55;1.28;.75;.55"
              keyTimes="0;.42;.68;1"
              dur="1.9s"
              begin=".55s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      </g>
      <g data-magic-coin-sparkle="upper" filter={`url(#${glowId})`}>
        <g transform="translate(23.1 9.5)">
          <path
            d="M0-1.35.33-.33 1.35 0l-1.02.33L0 1.35l-.33-1.02L-1.35 0l1.02-.33L0-1.35Z"
            fill="#fffde0"
          >
            <animate
              attributeName="opacity"
              values=".25;1;.25"
              dur="2.2s"
              begin="1.05s"
              repeatCount="indefinite"
            />
            <animateTransform
              attributeName="transform"
              type="scale"
              values=".55;1.42;.55"
              keyTimes="0;.48;1"
              dur="2.2s"
              begin="1.05s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      </g>
    </svg>
  );
}
