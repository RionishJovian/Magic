import type { GemChrome } from "./gem-offer-chrome.data";

export type { GemChrome } from "./gem-offer-chrome.data";

export function GemIcon({
  gradient,
  glow,
  size = 44,
}: {
  gradient: [string, string];
  glow: string;
  size?: number;
}) {
  const icon = Math.round(size * 0.5);
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center rounded-2xl"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        boxShadow: `0 10px 26px -10px rgba(${glow},0.9)`,
      }}
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3h12l3 6-9 12L3 9l3-6z" />
        <path d="M3 9h18M9 3l-3 6 6 12 6-12-3-6" />
      </svg>
    </span>
  );
}
