import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Coins,
  FileText,
  KeyRound,
  Loader2,
  Play,
  Sparkles,
  UserRound
} from "lucide-react";
import { getMatches, getSearchRun, listSeenJobs, startSearchRun } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTokenometer } from "../lib/tokenometer";
import { useReadiness, useWorkspace } from "../lib/workspace";
import type { SearchRun } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Progress } from "../components/ui/Progress";

const stageList = [
  { key: "queries", title: "Generate role queries", body: "Expanding position titles and search queries." },
  { key: "search", title: "Search live listings", body: "Pulling recent postings from the open web." },
  { key: "verify", title: "Verify active", body: "Checking each posting is still accepting applications." },
  { key: "compare", title: "Compare to resume", body: "Mapping JDs against skills, tools, and experience." },
  { key: "rank", title: "Rank fit", body: "Scoring matches and writing rationales." }
];

function stageProgress(run: SearchRun | null) {
  if (!run) return 0;
  if (run.status === "completed") return 100;
  if (run.status === "failed") return 0;
  const hasQueries = (run.keywords?.search_queries?.length ?? 0) > 0;
  if (run.status === "pending") return 8;
  return hasQueries ? 55 : 25;
}

export function SearchPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { provider, resume, profileComplete, ready } = useReadiness();
  const { activeRun, setActiveRun, setMatches, setRuns, setSeenJobs } = useWorkspace();
  const { refresh: refreshTokens } = useTokenometer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const running = activeRun?.status === "pending" || activeRun?.status === "running";

  useEffect(() => {
    if (!running || !activeRun) return;
    const id = window.setInterval(async () => {
      try {
        const run = await getSearchRun(token!, activeRun.id);
        setActiveRun(run);
        setRuns((rs) => [run, ...rs.filter((r) => r.id !== run.id)]);
        if (run.status === "completed" || run.status === "failed") {
          if (run.status === "completed") {
            setMatches(await getMatches(token!, run.id));
            setSeenJobs(await listSeenJobs(token!));
          }
          void refreshTokens();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not refresh search run.");
      }
    }, 2500);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRun?.id, running]);

  async function launch() {
    if (!ready) return;
    setBusy(true);
    setError("");
    setMatches([]);
    try {
      const run = await startSearchRun(token!);
      setActiveRun(run);
      setRuns((rs) => [run, ...rs]);
      void refreshTokens();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start search.");
    } finally {
      setBusy(false);
    }
  }

  const tokens = activeRun?.token_usage?.total_tokens ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent run"
        title="Find current matching jobs"
        description="Five focused stages: query → search → verify → compare → rank."
        actions={
          activeRun?.status === "completed" && (
            <Link to="/app/jobs">
              <Button rightIcon={<ArrowRight size={14} />}>View {""} matches</Button>
            </Link>
          )
        }
      />

      {error && <Banner tone="danger" title="Search error">{error}</Banner>}
      {activeRun?.status === "failed" && activeRun.error_message && (
        <Banner tone="danger" title="Agent run failed">{activeRun.error_message}</Banner>
      )}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
        <Card>
          <CardHeader
            eyebrow="Readiness"
            title="Before you run"
            description="Three things the agent needs to start."
          />
          <CardBody className="space-y-3">
            <ReadinessRow
              ok={Boolean(provider)}
              icon={<KeyRound size={16} />}
              title="Model provider"
              value={provider ? `${provider.provider} · ${provider.model}` : "Not connected"}
              cta={!provider ? { label: "Connect", to: "/app/provider" } : undefined}
            />
            <ReadinessRow
              ok={profileComplete}
              icon={<UserRound size={16} />}
              title="Candidate profile"
              value={profileComplete ? "Complete" : "Missing target role or skills"}
              cta={!profileComplete ? { label: "Complete", to: "/app/profile" } : undefined}
            />
            <ReadinessRow
              ok={Boolean(resume)}
              icon={<FileText size={16} />}
              title="Resume"
              value={resume ? resume.file_name : "Not uploaded"}
              cta={!resume ? { label: "Upload", to: "/app/resume" } : undefined}
            />

            <div className="pt-3 border-t border-border mt-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <p className="text-xs text-subtle break-anywhere">
                Each run uses your provider key. We never proxy or store your responses.
              </p>
              <Button
                size="lg"
                onClick={launch}
                disabled={!ready || busy || running}
                loading={busy}
                leftIcon={running ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                className="w-full sm:w-auto"
              >
                {running ? "Agent running…" : "Search jobs"}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            eyebrow="This run"
            title="Live progress"
            icon={
              running ? (
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse-soft" />
              ) : activeRun?.status === "completed" ? (
                <CheckCircle2 size={18} className="text-success" />
              ) : activeRun?.status === "failed" ? (
                <AlertCircle size={18} className="text-danger" />
              ) : (
                <Sparkles size={18} className="text-subtle" />
              )
            }
          />
          <CardBody className="space-y-4">
            <Progress value={stageProgress(activeRun)} />
            <ol className="space-y-2.5">
              {stageList.map((s, i) => {
                const done =
                  (activeRun?.status === "completed") ||
                  (running && i === 0 && (activeRun?.keywords?.search_queries?.length ?? 0) > 0) ||
                  (running && i < 1);
                const current = running && !done && i === 0;
                return (
                  <li key={s.key} className="flex items-start gap-3">
                    <span
                      className={
                        "mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 border " +
                        (done
                          ? "bg-accent text-accent-fg border-accent"
                          : current
                          ? "border-accent text-accent animate-pulse-soft"
                          : "border-border text-subtle")
                      }
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-subtle">{s.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="rounded-xl border border-border bg-bg/40 px-3 py-2 flex flex-wrap items-center gap-2 text-xs text-subtle">
              <Coins size={14} />
              Tokens used this run:
              <span className="text-fg tabular-nums font-medium sm:ml-auto">
                {tokens ? tokens.toLocaleString() : "—"}
              </span>
            </div>
          </CardBody>
        </Card>
      </div>

      {activeRun?.keywords?.search_queries?.length ? (
        <Card>
          <CardHeader eyebrow="Generated queries" title="What the agent is searching for" />
          <CardBody>
            <div className="flex flex-wrap gap-1.5">
              {activeRun.keywords.search_queries.slice(0, 18).map((q) => (
                <span key={q} className="text-xs px-2.5 py-1 rounded-full bg-muted text-fg/85 border border-border">
                  {q}
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {activeRun?.status === "completed" && (
        <div className="flex justify-end">
          <Button size="lg" className="w-full sm:w-auto" onClick={() => navigate("/app/jobs")} rightIcon={<ArrowRight size={16} />}>
            View ranked matches
          </Button>
        </div>
      )}
    </div>
  );
}

function ReadinessRow({
  ok,
  icon,
  title,
  value,
  cta
}: {
  ok: boolean;
  icon: React.ReactNode;
  title: string;
  value: string;
  cta?: { label: string; to: string };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-bg/40 px-4 py-3 sm:flex-row sm:items-center">
      <span
        className={
          "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 " +
          (ok ? "bg-success/12 text-success" : "bg-muted text-subtle")
        }
      >
        {ok ? <CheckCircle2 size={18} /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-subtle break-anywhere">{value}</p>
      </div>
      {cta && (
        <Link to={cta.to} className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto" variant="ghost" size="sm" rightIcon={<ArrowRight size={14} />}>{cta.label}</Button>
        </Link>
      )}
    </div>
  );
}
