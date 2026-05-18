import { cn } from "../../lib/cn";

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div
        className="h-full bg-accent transition-[width] duration-500 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function Stepper({
  steps,
  current
}: {
  steps: { label: string }[];
  current: number;
}) {
  return (
    <ol className="flex items-center gap-2 w-full" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.label} className="flex-1 flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 border transition-colors",
                done && "bg-accent text-accent-fg border-accent",
                active && "bg-surface text-accent border-accent",
                !done && !active && "bg-surface text-subtle border-border"
              )}
            >
              {i + 1}
            </span>
            <span
              className={cn(
                "text-sm truncate",
                active ? "text-fg font-medium" : "text-subtle"
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className={cn("h-px flex-1 mx-1", done ? "bg-accent" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
