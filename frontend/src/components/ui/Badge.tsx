import { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Tone = "neutral" | "accent" | "success" | "warn" | "danger" | "outline";

const toneCls: Record<Tone, string> = {
  neutral: "bg-muted text-fg",
  accent: "bg-accent/12 text-accent",
  success: "bg-success/12 text-success",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/12 text-danger",
  outline: "border border-border text-subtle"
};

export function Badge({
  tone = "neutral",
  className,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneCls[tone],
        className
      )}
      {...rest}
    />
  );
}
