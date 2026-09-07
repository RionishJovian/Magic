import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/** Telegram paper-plane mark used on marketing CTAs. */
export function TelegramPlaneIcon({ className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="M21.94 4.36a1.5 1.5 0 0 0-1.6-.23L3.4 11.02c-1.16.5-1.14 2.16.03 2.62l4.2 1.63 1.63 5.2c.32 1.02 1.6 1.32 2.34.55l2.4-2.51 4.2 3.1c.9.66 2.2.17 2.42-.94l2.94-14.53a1.5 1.5 0 0 0-.62-1.78zM9.9 14.9l8.7-6.4-6.9 7.5-.1 3.1-1.7-4.2z" />
    </svg>
  );
}
