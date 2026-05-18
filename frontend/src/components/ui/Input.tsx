import { InputHTMLAttributes, forwardRef, ReactNode, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const baseField =
  "w-full min-w-0 bg-surface text-fg placeholder:text-subtle/70 border border-border rounded-xl px-3.5 h-11 text-sm transition-colors hover:border-border focus:border-accent disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { leftIcon?: ReactNode }>(
  function Input({ className, leftIcon, ...rest }, ref) {
    if (leftIcon) {
      return (
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none">{leftIcon}</span>
          <input ref={ref} className={cn(baseField, "pl-10", className)} {...rest} />
        </div>
      );
    }
    return <input ref={ref} className={cn(baseField, className)} {...rest} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(baseField, "h-auto py-3 leading-relaxed resize-y min-h-[88px]", className)}
        {...rest}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          baseField,
          "appearance-none bg-[length:14px] bg-no-repeat bg-[right_14px_center] pr-10",
          "bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")]",
          className
        )}
        {...rest}
      >
        {children}
      </select>
    );
  }
);

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-fg flex items-center gap-1">
          {label}
          {required && <span className="text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-subtle">{hint}</p>
      ) : null}
    </div>
  );
}
