import { MarketingCtaExternal } from "@/components/MarketingCta";
import { TelegramPlaneIcon } from "@/components/TelegramPlaneIcon";
import { TELEGRAM_SUPPORT_URL } from "@/lib/telegram-support";
import { cn } from "@/lib/utils";

type Label = "Message on Telegram" | "Contact us on Telegram";

type Props = {
  label?: Label;
  /** Marketing glow (landing) vs in-app primary pill. */
  variant?: "glow" | "app";
  className?: string;
  "aria-label"?: string;
};

const ariaForLabel: Record<Label, string> = {
  "Message on Telegram": "Contact MikroTik Magic support on Telegram",
  "Contact us on Telegram": "Contact us on Telegram",
};

/** Pill CTA to the public support Telegram chat — always includes the orbiting plane. */
export function TelegramCta({
  label = "Message on Telegram",
  variant = "glow",
  className,
  "aria-label": ariaLabel,
}: Props) {
  return (
    <MarketingCtaExternal
      href={TELEGRAM_SUPPORT_URL}
      variant={variant === "glow" ? "glow" : "plain"}
      orbitingPlane
      aria-label={ariaLabel ?? ariaForLabel[label]}
      className={cn(
        variant === "app" &&
          "inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      <TelegramPlaneIcon />
      {label}
    </MarketingCtaExternal>
  );
}
