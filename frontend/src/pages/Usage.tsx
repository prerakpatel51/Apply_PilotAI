import { useMemo } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Coins,
  Cpu,
  FileText,
  Gauge,
  Loader2,
  RefreshCw,
  Search,
  Sparkles
} from "lucide-react";
import { useTokenometer } from "../lib/tokenometer";
import type { UsageEvent } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Banner } from "../components/ui/Banner";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic"
};

function format(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function UsagePage() {
  const { snapshot, loading, error, refresh } = useTokenometer();

  const running = snapshot?.current_run?.status === "running" || snapshot?.current_run?.status === "pending";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tokenometer"
        title="Usage"
        description="Real-time and lifetime token usage across agent runs and resume extractions."
        actions={
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void refresh()} leftIcon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        }
      />

      {error && <Banner tone="warn" title="Token usage unavailable">{error}</Banner>}

      {loading && !snapshot ? (
        <UsageSkeleton />
      ) : !snapshot ? (
        <EmptyState icon={<Gauge size={20} />} title="No data yet" description="Sign in and run a search to populate this page." />
      ) : (
        <>
          <SummaryGrid snapshot={snapshot} running={!!running} />
          <Splits snapshot={snapshot} />
          <ActivityTable events={snapshot.events} />
        </>
      )}
    </div>
  );
}

function SummaryGrid({ snapshot, running }: { snapshot: NonNullable<ReturnType<typeof useTokenometer>["snapshot"]>; running: boolean }) {
  const provider = snapshot.provider ? providerLabel[snapshot.provider] ?? snapshot.provider : "Not connected";

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <SummaryCard
        icon={<Activity size={16} />}
        eyebrow="Lifetime"
        title={`${snapshot.lifetime.total_tokens.toLocaleString()} tokens`}
        hint={`prompt ${snapshot.lifetime.prompt_tokens.toLocaleString()} · completion ${snapshot.lifetime.completion_tokens.toLocaleString()}`}
      />
      <SummaryCard
        icon={running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        eyebrow={running ? "Live run" : "Last run"}
        title={`${(running ? snapshot.current_run!.total_tokens : snapshot.last_run_total).toLocaleString()} tokens`}
        hint={
          running
            ? `Run #${snapshot.current_run!.user_run_number ?? snapshot.current_run!.id} · ${snapshot.current_run!.status}`
            : snapshot.last_run_total
            ? "Most recent search run"
            : "No runs yet"
        }
        tone={running ? "accent" : "default"}
      />
      <SummaryCard
        icon={<Cpu size={16} />}
        eyebrow="Provider"
        title={provider}
        hint={snapshot.model ?? "No model selected"}
      />
      <SummaryCard
        icon={<Coins size={16} />}
        eyebrow="Server time"
        title={new Date(snapshot.server_time).toLocaleTimeString()}
        hint={new Date(snapshot.server_time).toLocaleDateString()}
      />
    </div>
  );
}

function SummaryCard({
  icon,
  eyebrow,
  title,
  hint,
  tone = "default"
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  hint?: string;
  tone?: "default" | "accent";
}) {
  return (
    <Card className={tone === "accent" ? "border-accent/40 bg-accent/6" : ""}>
      <CardBody className="space-y-2">
        <div className="flex items-center gap-2 text-subtle text-[11px] uppercase tracking-[0.14em] font-medium">
          <span className={tone === "accent" ? "text-accent" : ""}>{icon}</span>
          {eyebrow}
        </div>
        <p className="text-xl font-semibold tabular-nums">{title}</p>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </CardBody>
    </Card>
  );
}

function Splits({ snapshot }: { snapshot: NonNullable<ReturnType<typeof useTokenometer>["snapshot"]> }) {
  const sr = snapshot.search_runs;
  const ex = snapshot.extractions;
  const total = sr.total_tokens + ex.total_tokens;
  const srPct = total ? (sr.total_tokens / total) * 100 : 0;
  const exPct = total ? (ex.total_tokens / total) * 100 : 0;

  return (
    <Card>
      <CardHeader
        eyebrow="Split"
        title="Tokens by workload"
        description="How your lifetime tokens divide across agent search runs and resume extractions."
      />
      <CardBody className="space-y-5">
        <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
          <div className="h-full bg-accent transition-[width] duration-700" style={{ width: `${srPct}%` }} />
          <div className="h-full bg-success transition-[width] duration-700" style={{ width: `${exPct}%` }} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <SplitRow icon={<Search size={14} />} label="Search runs" tone="accent" tokens={sr} pct={srPct} />
          <SplitRow icon={<FileText size={14} />} label="Resume extractions" tone="success" tokens={ex} pct={exPct} />
        </div>
      </CardBody>
    </Card>
  );
}

function SplitRow({
  icon,
  label,
  tone,
  tokens,
  pct
}: {
  icon: React.ReactNode;
  label: string;
  tone: "accent" | "success";
  tokens: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  pct: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg/40 p-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-medium">
          <span className={tone === "accent" ? "text-accent" : "text-success"}>{icon}</span>
          {label}
        </div>
        <span className="text-xs text-subtle tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <p className="text-lg font-semibold mt-1.5 tabular-nums">{tokens.total_tokens.toLocaleString()}</p>
      <p className="text-xs text-subtle mt-0.5">
        prompt {tokens.prompt_tokens.toLocaleString()} · completion {tokens.completion_tokens.toLocaleString()}
      </p>
    </div>
  );
}

function ActivityTable({ events }: { events: UsageEvent[] }) {
  const peak = useMemo(() => Math.max(1, ...events.map((e) => e.total_tokens)), [events]);

  return (
    <Card>
      <CardHeader
        eyebrow="Activity"
        title="Recent token-using events"
        description="Search runs and resume extractions. Bars are scaled to the largest event in the window."
      />
      <CardBody>
        {events.length === 0 ? (
          <EmptyState
            icon={<Activity size={20} />}
            title="No activity yet"
            description="Start a search or extract a resume profile to see token usage here."
          />
        ) : (
          <div className="overflow-x-auto scrollbar-thin -mx-4 sm:-mx-5">
            <table className="w-full text-sm min-w-[42rem]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-subtle">
                  <th className="px-5 py-2 font-medium">Event</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Model</th>
                  <th className="px-2 py-2 font-medium text-right">Prompt</th>
                  <th className="px-2 py-2 font-medium text-right">Completion</th>
                  <th className="px-2 py-2 font-medium text-right">Total</th>
                  <th className="px-2 py-2 font-medium">Share</th>
                  <th className="px-5 py-2 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev, i) => (
                  <tr
                    key={`${ev.kind}-${ev.id}`}
                    className={i % 2 === 0 ? "bg-bg/30" : ""}
                  >
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={
                            "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 " +
                            (ev.kind === "search_run" ? "bg-accent/10 text-accent" : "bg-success/10 text-success")
                          }
                        >
                          {ev.kind === "search_run" ? <Search size={13} /> : <FileText size={13} />}
                        </span>
                        <span className="truncate font-medium">{ev.label}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5"><StatusBadge status={ev.status} /></td>
                    <td className="px-2 py-2.5 text-subtle">
                      {ev.provider ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-fg">{providerLabel[ev.provider] ?? ev.provider}</span>
                          {ev.model && <span className="font-mono text-[11px]">{ev.model}</span>}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{format(ev.prompt_tokens)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{format(ev.completion_tokens)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{format(ev.total_tokens)}</td>
                    <td className="px-2 py-2.5 min-w-[120px]">
                      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={
                            "h-full transition-[width] duration-500 " +
                            (ev.kind === "search_run" ? "bg-accent" : "bg-success")
                          }
                          style={{ width: `${(ev.total_tokens / peak) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right text-subtle text-xs">{formatWhen(ev.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") return <Badge tone="success"><CheckCircle2 size={11} /> Completed</Badge>;
  if (status === "failed") return <Badge tone="danger"><AlertCircle size={11} /> Failed</Badge>;
  if (status === "running" || status === "pending") return <Badge tone="accent"><Loader2 size={11} className="animate-spin" /> {status}</Badge>;
  return <Badge tone="outline">{status}</Badge>;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function UsageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
