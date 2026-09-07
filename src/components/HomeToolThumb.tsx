export type HomeToolAccent = "sage" | "pine" | "navy" | "gold" | "coral" | "mist";

type HomeToolThumbProps = {
  accent: HomeToolAccent;
  children: React.ReactNode;
  /** Compact circular badge for Quick actions. */
  size?: "md" | "sm";
};

/** Theme-aware thumbnail for Home dashboard feature cards (Elegant Natural Day + Night). */
export function HomeToolThumb({ accent, children, size = "md" }: HomeToolThumbProps) {
  return (
    <div
      className={`home-tool-thumb${size === "sm" ? " home-tool-thumb-sm" : ""}`}
      data-accent={accent}
      aria-hidden
    >
      <span className="home-tool-thumb-icon">{children}</span>
    </div>
  );
}
