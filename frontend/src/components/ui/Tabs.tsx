import { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: ReactNode }[];
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex p-1 rounded-xl bg-muted border border-border w-full"
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 h-9 px-3 rounded-lg text-sm font-medium transition-colors",
            o.value === value
              ? "bg-surface text-fg shadow-soft"
              : "text-subtle hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
