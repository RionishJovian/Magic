import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Decorative twinkling stars. Hidden from assistive tech. */
export function MagicHubSparkles() {
  return (
    <span className="magic-hub-sparkles" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="magic-hub-star" style={{ ["--i" as string]: i }} />
      ))}
    </span>
  );
}

type MagicHubButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

/** Primary Magic Hub CTA — brand gradient plus star sparkle. */
export function MagicHubButton({ children, className = "", ...props }: MagicHubButtonProps) {
  return (
    <button type="button" className={`magic-hub-btn ${className}`.trim()} {...props}>
      <MagicHubSparkles />
      <span className="relative z-[1]">{children}</span>
    </button>
  );
}
