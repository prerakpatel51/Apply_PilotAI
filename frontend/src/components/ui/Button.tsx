import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

const variantCls: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-fg hover:opacity-90 active:opacity-95 shadow-soft disabled:opacity-50",
  secondary:
    "bg-surface text-fg border border-border hover:bg-muted disabled:opacity-50",
  outline:
    "bg-transparent text-fg border border-border hover:bg-muted disabled:opacity-50",
  ghost:
    "bg-transparent text-fg hover:bg-muted disabled:opacity-50",
  danger:
    "bg-danger text-white hover:opacity-90 disabled:opacity-50"
};

const sizeCls: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-5 text-base rounded-xl gap-2"
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    children,
    disabled,
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex max-w-full min-w-0 items-center justify-center font-medium transition-all duration-150 select-none",
        "disabled:cursor-not-allowed",
        variantCls[variant],
        sizeCls[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      <span className="shrink-0 inline-flex">{loading ? <Loader2 className="animate-spin" size={16} aria-hidden /> : leftIcon}</span>
      {children && <span className="min-w-0 truncate">{children}</span>}
      {rightIcon && <span className="shrink-0 inline-flex">{rightIcon}</span>}
    </button>
  );
});
