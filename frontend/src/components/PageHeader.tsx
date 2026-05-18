import { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 sm:gap-4 mb-5 sm:mb-6">
      <div className="min-w-0 max-w-full">
        {eyebrow && <p className="text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">{eyebrow}</p>}
        <h1 className="text-2xl sm:text-display-md font-semibold mt-1 break-anywhere">{title}</h1>
        {description && <p className="text-sm sm:text-base text-subtle mt-1.5 max-w-2xl break-anywhere">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0">{actions}</div>}
    </div>
  );
}
