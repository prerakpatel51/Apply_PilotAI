import { cn } from "../../lib/cn";

export function ScoreRing({ score, size = 56, className }: { score: number; size?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  return (
    <div
      role="img"
      aria-label={`Match ${pct} of 100`}
      style={{ width: size, height: size, ["--pct" as string]: pct }}
      className={cn(
        "score-ring relative rounded-full flex items-center justify-center shrink-0",
        className
      )}
    >
      <div
        className="absolute inset-[4px] rounded-full bg-surface flex items-center justify-center"
      >
        <span className="text-sm font-semibold text-fg tabular-nums">{pct}</span>
      </div>
    </div>
  );
}
