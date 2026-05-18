import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, Cpu, Sparkles } from "lucide-react";
import { useTokenometer } from "../lib/tokenometer";
import { cn } from "../lib/cn";

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
};

function format(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function Tokenometer({ className }: { className?: string }) {
  const { snapshot, loading } = useTokenometer();

  const current = snapshot?.current_run;
  const running = current?.status === "running" || current?.status === "pending";
  const live = running ? current!.total_tokens : snapshot?.lifetime.total_tokens ?? 0;
  const animatedTokens = useAnimatedNumber(live);

  if (loading && !snapshot) {
    return (
      <div className={cn("inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-surface text-xs text-subtle", className)}>
        <span className="h-2 w-2 rounded-full bg-subtle/60" />
        <span>Usage</span>
      </div>
    );
  }

  if (!snapshot) return null;

  const provider = snapshot.provider ? providerLabel[snapshot.provider] ?? snapshot.provider : null;
  const model = snapshot.model;

  return (
    <Link
      to="/app/usage"
      className={cn(
        "group inline-flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-xl border bg-surface text-xs font-medium transition-colors hover:bg-muted",
        running ? "border-accent/40 bg-accent/8" : "border-border",
        className
      )}
      title={
        snapshot
          ? `Search runs: ${snapshot.search_runs.total_tokens.toLocaleString()} tokens\nExtractions: ${snapshot.extractions.total_tokens.toLocaleString()} tokens\nLifetime total: ${snapshot.lifetime.total_tokens.toLocaleString()} tokens${
              running
                ? `\nCurrent run #${current!.id}: ${current!.total_tokens.toLocaleString()} tokens (prompt ${current!.prompt_tokens.toLocaleString()} · completion ${current!.completion_tokens.toLocaleString()})`
                : ""
            }`
          : undefined
      }
      aria-live="polite"
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          running ? "bg-accent animate-pulse-soft" : provider ? "bg-success" : "bg-subtle/60"
        )}
        aria-hidden
      />
      {provider ? (
        <span className="flex items-center gap-1.5 text-fg">
          <Cpu size={12} className="text-subtle" />
          <span>{provider}</span>
          {model && (
            <>
              <span className="text-subtle/70">·</span>
              <span className="font-mono text-[11px] truncate max-w-[7rem]">{model}</span>
            </>
          )}
        </span>
      ) : (
        <span className="text-subtle inline-flex items-center gap-1.5">
          <Sparkles size={12} />
          No provider
        </span>
      )}
      <span className="text-subtle/70" aria-hidden>·</span>
      <span className="inline-flex items-center gap-1 text-fg tabular-nums">
        <Activity size={12} className={running ? "text-accent" : "text-subtle"} />
        <span>{format(animatedTokens)}</span>
        <span className="text-subtle text-[10px] uppercase tracking-wider">{running ? "live" : "total"}</span>
      </span>
    </Link>
  );
}

function useAnimatedNumber(target: number, duration = 600) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === value) return;
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const k = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const next = Math.round(fromRef.current + (target - fromRef.current) * eased);
      setValue(next);
      if (k < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
