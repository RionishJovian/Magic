import { cva } from "class-variance-authority";

/** Soft upper bound for spinner-button UX (unknown short actions). */
export const BUTTON_SPINNER_MAX_MS = 30_000;

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-md",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:-translate-y-0.5 hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground hover:border-primary/40",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:-translate-y-0.5 hover:bg-secondary/80",
        ghost: "hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 min-h-11 px-4 py-2 sm:min-h-9",
        sm: "h-8 min-h-11 rounded-md px-3 text-xs sm:min-h-8",
        lg: "h-10 min-h-11 rounded-md px-8 sm:min-h-10",
        icon: "h-9 w-9 min-h-11 min-w-11 sm:min-h-9 sm:min-w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
