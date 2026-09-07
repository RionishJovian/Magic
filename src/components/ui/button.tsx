import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "./button-variants";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Unknown-duration spinner for short actions (< ~30s).
   * Disables the control and shows a spinning icon.
   */
  loading?: boolean;
  /** Optional label while spinning; defaults to children. */
  loadingText?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const busy = Boolean(loading);

    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        data-loading={busy ? "true" : undefined}
        {...props}
      >
        {busy ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            {size === "icon" ? (
              <span className="sr-only">{loadingText ?? "Loading"}</span>
            ) : (
              <span>{loadingText ?? children}</span>
            )}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/** Standalone spinner for non-Button controls (raw `<button className="btn-primary">`). */
function ButtonSpinner({ className, ...props }: React.ComponentProps<typeof Loader2>) {
  return (
    <Loader2 className={cn("size-4 shrink-0 animate-spin", className)} aria-hidden {...props} />
  );
}

export { Button, ButtonSpinner };
