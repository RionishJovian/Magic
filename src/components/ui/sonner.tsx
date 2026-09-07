import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="bottom-center"
      expand
      visibleToasts={3}
      offset={{ bottom: "1.5rem" }}
      mobileOffset={{
        bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)",
        left: "0.75rem",
        right: "0.75rem",
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast !w-[min(26rem,calc(100vw-1.5rem))] !rounded-2xl !border !border-border/80 !bg-[color:var(--glass-bg-strong)] !p-4 !text-foreground !shadow-2xl !shadow-black/45 !ring-1 !ring-white/10 !backdrop-blur-2xl",
          title: "!pr-7 !text-sm !font-semibold !leading-5 !tracking-tight",
          description: "!mt-1 !pr-3 !text-sm !leading-5 !text-muted-foreground",
          icon: "!size-5 !shrink-0",
          success: "!border-l-4 !border-l-emerald-400 !bg-emerald-950/95",
          error: "!border-l-4 !border-l-red-400 !bg-red-950/95",
          warning: "!border-l-4 !border-l-amber-400 !bg-amber-950/95",
          info: "!border-l-4 !border-l-sky-400 !bg-sky-950/95",
          actionButton:
            "!mt-2 !min-h-10 !rounded-lg !bg-primary !px-3 !text-sm !font-semibold !text-primary-foreground !shadow-sm",
          cancelButton:
            "!mt-2 !min-h-10 !rounded-lg !border !border-border/80 !bg-surface !px-3 !text-sm !font-medium !text-foreground",
          closeButton:
            "!right-3 !top-3 !grid !size-7 !place-items-center !rounded-full !border !border-border/70 !bg-surface/90 !text-muted-foreground !shadow-sm hover:!bg-surface-elevated hover:!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
