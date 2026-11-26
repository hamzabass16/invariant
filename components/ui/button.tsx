import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-control font-medium select-none transition-[background-color,transform,opacity,box-shadow] duration-[var(--dur-1)] ease-[var(--ease-out-quint)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        primary: "bg-accent text-text hover:bg-accent-pressed active:bg-accent-pressed",
        secondary: "bg-surface-2 text-text shadow-[0_1px_0_var(--edge)_inset] hover:bg-surface-3 active:bg-hairline",
        danger: "bg-danger text-text active:brightness-90",
        ghost: "bg-transparent text-accent-text active:bg-accent-subtle",
      },
      size: {
        sm: "h-9 px-3 text-subhead",
        md: "h-11 px-4 text-body",
        lg: "h-12 w-full px-4 text-body",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonStyles> & { loading?: boolean };

export function Button({ className, variant, size, loading, disabled, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonStyles({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
