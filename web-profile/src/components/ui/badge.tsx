import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium tracking-normal",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--surface-subtle)] text-[var(--text)] border-[var(--border)]",
        primary:
          "bg-[var(--primary-subtle)] text-[var(--primary)] border-[var(--primary)]/30",
        accent:
          "bg-[var(--accent-subtle)] text-[var(--accent-text)] border-[var(--accent)]/35",
        danger:
          "bg-[var(--danger-subtle)] text-[var(--danger)] border-[var(--danger)]/40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
