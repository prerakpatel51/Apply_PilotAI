import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Clock3, ExternalLink, History, Loader2, Search, Trash2 } from "lucide-react";
import { clearSeenJobs, deleteSearchRun, deleteSeenJob, getMatches } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import type { SearchRun, SeenJob } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Banner } from "../components/ui/Banner";
import { EmptyState } from "../components/ui/EmptyState";

export function HistoryPage() {
  const { token } = useAuth();
  const { runs, seenJobs, activeRun, setActiveRun, setMatches, setRuns, setSeenJobs } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const groupedJobs = useMemo(() => groupByDate(seenJobs, (s) => s.last_seen_at), [seenJobs]);
  const groupedRuns = useMemo(() => groupByDate(runs, (r) => r.created_at), [runs]);

  async function selectRun(run: SearchRun) {
    setActiveRun(run);
    if (run.status === "completed" || run.status === "failed") {
      setMatches(await getMatches(token!, run.id));
    } else {
      setMatches([]);
    }
  }

  async function removeRun(run: SearchRun) {
    if (run.status === "pending" || run.status === "running") return;
    if (!window.confirm(`Delete ${runLabel(run)}? Its ranked matches will also be removed.`)) return;
    setBusy(`run-${run.id}`);
    setError("");
    try {
      await deleteSearchRun(token!, run.id);
      setRuns((rs) => rs.filter((r) => r.id !== run.id));
      if (activeRun?.id === run.id) {
        setActiveRun(null);
        setMatches([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete run.");
    } finally {
      setBusy(null);
    }
  }

  async function removeSeen(seen: SeenJob) {
    setBusy(`seen-${seen.id}`);
    setError("");
    try {
      await deleteSeenJob(token!, seen.id);
      setSeenJobs((items) => items.filter((s) => s.id !== seen.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove seen job.");
    } finally {
      setBusy(null);
    }
  }

  async function clearAllSeen() {
    if (!window.confirm("Clear all previously-seen jobs? They can resurface in future searches.")) return;
    setBusy("clear-all");
    setError("");
    try {
      await clearSeenJobs(token!);
      setSeenJobs([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear history.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="History"
        title="Previous jobs and search runs"
        description="Past matches grouped by date and a compact run history."
      />

      {error && <Banner tone="danger" title="Could not update">{error}</Banner>}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <CardHeader
            eyebrow="Previous jobs"
            title="Seen by date"
            action={
              seenJobs.length > 0 && (
                <Button
                  className="w-full sm:w-auto"
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 size={13} />}
                  loading={busy === "clear-all"}
                  onClick={() => void clearAllSeen()}
                >
                  Clear all
                </Button>
              )
            }
          />
          <CardBody className="space-y-6">
            {seenJobs.length === 0 ? (
              <EmptyState
                icon={<History size={20} />}
                title="No history yet"
                description="Jobs surfaced by searches will appear here grouped by date."
                action={
                  <Link to="/app/search">
                    <Button leftIcon={<Search size={14} />}>Run your first search</Button>
                  </Link>
                }
              />
            ) : (
              groupedJobs.map((g) => (
                <section key={g.label}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-subtle mb-3">{g.label}</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    {g.items.map((seen: SeenJob) => (
                      <div
                        key={seen.id}
                        className="group flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-bg/40 p-3 hover:bg-muted/50 hover:border-fg/10 transition-colors sm:flex-row sm:items-center"
                      >
                        <a
                          href={seen.job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex min-w-0 flex-1 items-start gap-3 sm:items-center"
                        >
                          <div className="h-10 w-10 rounded-lg bg-muted border border-border flex items-center justify-center text-xs font-semibold shrink-0">
                            {initialsFor(seen.job.company)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium break-anywhere">{seen.job.title}</p>
                            <p className="text-xs text-subtle break-anywhere">{seen.job.company} · {formatTime(seen.last_seen_at)}</p>
                          </div>
                          <ExternalLink size={14} className="mt-0.5 text-subtle group-hover:text-fg shrink-0 sm:mt-0" />
                        </a>
                        <button
                          type="button"
                          aria-label="Remove from history"
                          title="Remove from history"
                          onClick={(e) => {
                            e.stopPropagation();
                            void removeSeen(seen);
                          }}
                          disabled={busy === `seen-${seen.id}`}
                          className="inline-flex h-8 w-full items-center justify-center rounded-lg text-subtle hover:bg-danger/12 hover:text-danger transition-colors disabled:opacity-30 sm:h-7 sm:w-7 sm:shrink-0"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Search runs" title="Recent agent runs" />
          <CardBody className="space-y-4">
            {runs.length === 0 ? (
              <p className="text-sm text-subtle">No search runs yet.</p>
            ) : (
              groupedRuns.map((g) => (
                <section key={g.label}>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-subtle mb-2">{g.label}</p>
                  <div className="space-y-2">
                    {g.items.map((run: SearchRun) => {
                      const canDelete = run.status !== "pending" && run.status !== "running";
                      return (
                        <div
                          key={run.id}
                          className={
                            "flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-2.5 transition-colors sm:flex-row sm:items-center " +
                            (activeRun?.id === run.id
                              ? "border-accent bg-accent/8"
                              : "border-border hover:bg-muted/50")
                          }
                        >
                          <button
                            type="button"
                            onClick={() => void selectRun(run)}
                            className="flex min-w-0 flex-1 items-start gap-3 text-left sm:items-center"
                          >
                            <RunIcon status={run.status} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium">{runLabel(run)}</p>
                              <p className="text-xs text-subtle break-anywhere">
                                {run.provider}{run.model ? ` · ${run.model}` : ""} · {formatTime(run.created_at)}
                              </p>
                            </div>
                            <RunBadge status={run.status} />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete run"
                            title={canDelete ? "Delete run" : "Cannot delete a running run"}
                            onClick={() => void removeRun(run)}
                            disabled={!canDelete || busy === `run-${run.id}`}
                            className="inline-flex h-8 w-full items-center justify-center rounded-lg text-subtle hover:bg-danger/12 hover:text-danger transition-colors disabled:cursor-not-allowed disabled:opacity-30 sm:h-7 sm:w-7 sm:shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function RunIcon({ status }: { status: SearchRun["status"] }) {
  const cls = "h-8 w-8 rounded-lg flex items-center justify-center shrink-0";
  if (status === "completed") return <span className={cls + " bg-success/12 text-success"}><CheckCircle2 size={16} /></span>;
  if (status === "failed") return <span className={cls + " bg-danger/12 text-danger"}><AlertCircle size={16} /></span>;
  if (status === "running" || status === "pending")
    return <span className={cls + " bg-accent/12 text-accent"}><Loader2 size={16} className="animate-spin" /></span>;
  return <span className={cls + " bg-muted text-subtle"}><Clock3 size={16} /></span>;
}

function RunBadge({ status }: { status: SearchRun["status"] }) {
  const tone =
    status === "completed" ? "success" : status === "failed" ? "danger" : status === "running" || status === "pending" ? "accent" : "outline";
  return <Badge tone={tone as any}>{status}</Badge>;
}

function runLabel(run: SearchRun) {
  return `Run #${run.user_run_number ?? run.id}`;
}

function initialsFor(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "J"
  );
}

function groupByDate<T>(items: T[], dateOf: (t: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const label = formatRunDate(dateOf(item));
    map.set(label, [...(map.get(label) ?? []), item]);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function formatRunDate(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function formatTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(d);
}
