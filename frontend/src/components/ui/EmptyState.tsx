import { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center gap-3 py-12 px-6 rounded-2xl border border-dashed border-border bg-surface/60",
        className
      )}
    >
      {icon && (
        <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center text-subtle">
          {icon}
        </div>
      )}
      <div className="space-y-1 max-w-md">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        {description && <p className="text-sm text-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}
