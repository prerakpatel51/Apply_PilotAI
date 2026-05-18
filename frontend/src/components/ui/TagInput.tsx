import { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

export function TagInput({
  value,
  onChange,
  placeholder,
  className,
  inputProps
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div
      className={cn(
        "flex flex-wrap gap-1.5 min-h-[2.75rem] w-full rounded-xl border border-border bg-surface px-2.5 py-2",
        "focus-within:border-accent transition-colors",
        className
      )}
      onClick={(e) => {
        const t = e.currentTarget.querySelector("input");
        t?.focus();
      }}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 rounded-lg bg-accent/10 text-accent border border-accent/25 px-2 h-7 text-xs font-medium"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={(e) => {
              e.stopPropagation();
              remove(i);
            }}
            className="hover:bg-accent/15 rounded p-0.5"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) {
            commit(v.slice(0, -1));
          } else {
            setDraft(v);
          }
        }}
        onKeyDown={onKey}
        onBlur={() => draft && commit(draft)}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm placeholder:text-subtle/70 h-7"
        {...inputProps}
      />
    </div>
  );
}
