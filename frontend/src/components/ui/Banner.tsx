import { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/cn";

type Tone = "info" | "success" | "warn" | "danger";

const toneCls: Record<Tone, string> = {
  info: "bg-accent/8 text-fg border-accent/30",
  success: "bg-success/10 text-fg border-success/30",
  warn: "bg-warn/12 text-fg border-warn/35",
  danger: "bg-danger/10 text-fg border-danger/35"
};

const Icon = { info: Info, success: CheckCircle2, warn: AlertTriangle, danger: AlertCircle };

export function Banner({
  tone = "info",
  title,
  children,
  className,
  action
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const I = Icon[tone];
  return (
    <div
      role={tone === "danger" || tone === "warn" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm animate-fade-in", toneCls[tone], className)}
    >
      <I size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex-1 min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5 text-subtle text-[13px]")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
