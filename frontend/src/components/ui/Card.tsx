import { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl bg-surface border border-border shadow-soft",
        "transition-shadow",
        className
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
  icon,
  action,
  className
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 p-4 sm:p-5 border-b border-border sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 max-w-full">
        {eyebrow && <p className="text-xs uppercase tracking-[0.14em] text-subtle font-medium">{eyebrow}</p>}
        {title && <h3 className="text-base font-semibold text-fg mt-1 break-anywhere">{title}</h3>}
        {description && <p className="text-sm text-subtle mt-1 break-anywhere">{description}</p>}
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2 sm:shrink-0">
        {action}
        {icon && <span className="text-subtle">{icon}</span>}
      </div>
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 p-4 sm:p-5", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 p-4 sm:p-5 border-t border-border", className)} {...rest} />;
}
