import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  Cpu,
  Database,
  Gauge,
  ListChecks,
  RefreshCw,
  Server,
  Sparkles,
  Users
} from "lucide-react";
import { adminAnalytics, adminFailedRuns, adminLiveRuns, adminQueueStats, adminSystem } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminAnalytics, AdminFailedRun, AdminLiveRun, AdminQueueStats, AdminSystem } from "../../lib/types";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { Skeleton } from "../../components/ui/Skeleton";

function format(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function AdminOverviewPage() {
  const { token } = useAuth();
  const [live, setLive] = useState<AdminLiveRun[]>([]);
  const [failed, setFailed] = useState<AdminFailedRun[]>([]);
  const [queue, setQueue] = useState<AdminQueueStats | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [system, setSystem] = useState<AdminSystem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  async function pull() {
    setError("");
    try {
      const [l, f, q, a, s] = await Promise.all([
        adminLiveRuns(token!),
        adminFailedRuns(token!),
        adminQueueStats(token!),
        adminAnalytics(token!),
        adminSystem(token!)
      ]);
      setLive(l);
      setFailed(f);
      setQueue(q);
      setAnalytics(a);
      setSystem(s);
      setLastSync(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load overview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void pull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  const totalUsers = analytics?.funnel.signups ?? 0;
  const liveCount = live.length;
  const queueDepth = (queue?.queued ?? 0) + (queue?.in_progress ?? 0);
  const lifetimeTokens = system
    ? Object.entries(system.db_rows).reduce((acc, [k, v]) => (k === "search_runs" ? acc : acc), 0)
    : 0;
  void lifetimeTokens;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Overview"
        description="Manual refresh — no background polling."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
            {lastSync && (
              <span className="text-xs text-subtle">
                Last sync {lastSync.toLocaleTimeString()}
              </span>
            )}
            <Button className="w-full sm:w-auto" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => void pull()}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Banner tone="danger" title="Could not refresh">{error}</Banner>}

      {/* Headline metrics */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Users size={15} />}
          eyebrow="Users"
          value={String(totalUsers)}
          hint={`${analytics?.funnel.three_plus_runs ?? 0} active (≥3 runs)`}
        />
        <KpiCard
          icon={<Activity size={15} />}
          eyebrow="Live runs"
          value={String(liveCount)}
          hint={liveCount ? "agent pipelines running now" : "system idle"}
          tone={liveCount ? "accent" : "default"}
        />
        <KpiCard
          icon={<Gauge size={15} />}
          eyebrow="Queue depth"
          value={String(queueDepth)}
          hint={queue ? `${queue.queued} queued · ${queue.in_progress} working` : ""}
          tone={queueDepth > 5 ? "warn" : "default"}
        />
        <KpiCard
          icon={<AlertCircle size={15} />}
          eyebrow="Recent failures"
          value={String(failed.length)}
          hint={failed[0] ? `latest: ${failed[0].error_message?.slice(0, 40) ?? "unknown"}…` : "none"}
          tone={failed.length ? "warn" : "default"}
        />
      </div>

      {/* Live runs + recent failures */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader
            eyebrow="In flight"
            title="Currently running"
            icon={<Activity size={16} className={liveCount ? "text-accent" : "text-subtle"} />}
            action={
              <Link to="/app/admin/runs" className="text-xs text-accent hover:underline">
                See runs page →
              </Link>
            }
          />
          <CardBody>
            {!liveCount ? (
              <p className="text-sm text-subtle">No runs in flight.</p>
            ) : (
              <ul className="space-y-2">
                {live.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/6 p-3"
                  >
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse-soft shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        Run #{r.id} <span className="text-subtle">· {r.user_email}</span>
                      </p>
                      <p className="text-xs text-subtle truncate">
                        {r.provider} · {r.stage.replace(/_/g, " ")} · {r.queries_generated} queries · {Math.floor(r.elapsed_seconds)}s
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{format(r.total_tokens)}</p>
                      <p className="text-[10px] uppercase tracking-wider text-subtle">tokens</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            eyebrow="Failures"
            title={`Recent ${failed.length} failed runs`}
            icon={<AlertCircle size={16} className={failed.length ? "text-warn" : "text-subtle"} />}
          />
          <CardBody>
            {!failed.length ? (
              <p className="text-sm text-subtle">No failures.</p>
            ) : (
              <ul className="space-y-2">
                {failed.slice(0, 5).map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-bg/40 p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge tone="danger">#{r.fingerprint}</Badge>
                      <span className="font-medium">Run #{r.id}</span>
                      <span className="text-subtle text-xs truncate">· {r.user_email}</span>
                    </div>
                    <p className="text-xs text-subtle mt-1 line-clamp-2 break-words">{r.error_message || "—"}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Funnel + provider mix */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader
            eyebrow="Activation"
            title="User funnel"
            icon={<ListChecks size={16} />}
            action={
              <Link to="/app/admin/analytics" className="text-xs text-accent hover:underline">
                Full analytics →
              </Link>
            }
          />
          <CardBody>{analytics && <FunnelBars data={analytics.funnel} />}</CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Models" title="Active provider mix" icon={<Cpu size={16} />} />
          <CardBody>
            {analytics && <MixList data={analytics.provider_mix} />}
            {analytics && Object.keys(analytics.model_mix || {}).length > 0 && (
              <>
                <p className="text-[11px] uppercase tracking-[0.14em] text-subtle mt-5 mb-2">Top models</p>
                <MixList data={analytics.model_mix} />
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {/* System snapshot */}
      <Card>
        <CardHeader
          eyebrow="System"
          title="Health snapshot"
          icon={<Server size={16} />}
          action={
            <Link to="/app/admin/system" className="text-xs text-accent hover:underline">
              Full system page →
            </Link>
          }
        />
        <CardBody>
          {system && (
            <div className="grid sm:grid-cols-3 gap-3">
              <KpiCard
                icon={<Database size={14} />}
                eyebrow="DB rows"
                value={format(Object.values(system.db_rows).reduce((a, b) => a + b, 0))}
                hint={`${Object.keys(system.db_rows).length} tables`}
              />
              <KpiCard
                icon={<Server size={14} />}
                eyebrow="Storage"
                value={bytes(system.storage_bytes)}
                hint={`${system.storage_files} resume files`}
              />
              <KpiCard
                icon={<Sparkles size={14} />}
                eyebrow="Avg match score"
                value={analytics ? String(analytics.match_score_avg) : "—"}
                hint="across all matches"
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  eyebrow,
  value,
  hint,
  tone = "default"
}: {
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "warn";
}) {
  const accent =
    tone === "accent"
      ? "border-accent/40 bg-accent/6"
      : tone === "warn"
      ? "border-warn/35 bg-warn/6"
      : "";
  return (
    <Card className={accent}>
      <CardBody>
        <div className="flex items-center gap-2 text-subtle text-[11px] uppercase tracking-[0.14em] font-medium">
          <span className={tone === "accent" ? "text-accent" : tone === "warn" ? "text-warn" : ""}>{icon}</span>
          {eyebrow}
        </div>
        <p className="text-2xl font-semibold tabular-nums mt-1.5 leading-none">{value}</p>
        {hint && <p className="text-xs text-subtle mt-1.5 truncate">{hint}</p>}
      </CardBody>
    </Card>
  );
}

function FunnelBars({ data }: { data: Record<string, number> }) {
  const labels: Record<string, string> = {
    signups: "Signups",
    provider_connected: "Provider connected",
    resume_uploaded: "Resume uploaded",
    first_search: "First search",
    three_plus_runs: "≥3 runs"
  };
  const order = ["signups", "provider_connected", "resume_uploaded", "first_search", "three_plus_runs"];
  const peak = Math.max(1, ...order.map((k) => data[k] ?? 0));
  return (
    <div className="space-y-2.5">
      {order.map((k) => {
        const v = data[k] ?? 0;
        const pct = (v / peak) * 100;
        const conv = data.signups ? ((v / data.signups) * 100).toFixed(0) : "0";
        return (
          <div key={k}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-subtle">{labels[k]}</span>
              <span className="tabular-nums">
                <span className="font-semibold">{v}</span>{" "}
                <span className="text-subtle">· {conv}%</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MixList({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  if (!entries.length) return <p className="text-sm text-subtle">No data yet.</p>;
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  return (
    <ul className="space-y-2">
      {entries.map(([k, v]) => (
        <li key={k}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="font-medium truncate max-w-[14rem]">{k}</span>
            <span className="tabular-nums text-subtle">
              {v} · {Math.round((v / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${(v / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
