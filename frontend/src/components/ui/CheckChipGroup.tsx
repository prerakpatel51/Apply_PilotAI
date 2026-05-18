import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

export function CheckChipGroup({
  options,
  value,
  onChange,
  multiple = true,
  className,
  ariaLabel
}: {
  options: { value: string; label: string; description?: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  function toggle(v: string) {
    const has = value.includes(v);
    if (!multiple) {
      onChange(has ? [] : [v]);
      return;
    }
    onChange(has ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-label={ariaLabel}
      className={cn("grid grid-cols-2 sm:grid-cols-3 gap-2", className)}
    >
      {options.map((o) => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={active}
            onClick={() => toggle(o.value)}
            className={cn(
              "group text-left rounded-xl border px-3 py-2.5 transition-all flex items-start gap-2",
              active
                ? "border-accent bg-accent/8 shadow-soft"
                : "border-border bg-surface hover:border-fg/20 hover:bg-muted/40"
            )}
          >
            <span
              className={cn(
                "mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                active ? "bg-accent border-accent text-accent-fg" : "border-border bg-surface"
              )}
              aria-hidden
            >
              {active && <Check size={11} strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <p className={cn("text-sm font-medium leading-tight", active ? "text-fg" : "text-fg/90")}>
                {o.label}
              </p>
              {o.description && <p className="text-xs text-subtle mt-0.5 leading-snug">{o.description}</p>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
