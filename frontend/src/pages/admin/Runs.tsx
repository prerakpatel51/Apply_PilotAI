import { useEffect, useState } from "react";
import { Activity, AlertCircle, RefreshCw, Skull } from "lucide-react";
import { adminFailedRuns, adminKillRun, adminLiveRuns } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminFailedRun, AdminLiveRun } from "../../lib/types";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";

function format(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function AdminRunsPage() {
  const { token } = useAuth();
  const [live, setLive] = useState<AdminLiveRun[]>([]);
  const [failed, setFailed] = useState<AdminFailedRun[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  async function pull() {
    setError("");
    try {
      const [l, f] = await Promise.all([adminLiveRuns(token!), adminFailedRuns(token!)]);
      setLive(l);
      setFailed(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load runs.");
    }
  }

  useEffect(() => {
    void pull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function kill(r: AdminLiveRun) {
    if (!window.confirm(`Kill run #${r.id} for ${r.user_email}?`)) return;
    setBusyId(r.id);
    try {
      await adminKillRun(token!, r.id);
      await pull();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not kill run.");
    } finally {
      setBusyId(null);
    }
  }

  // Group failed by fingerprint.
  const byFingerprint = failed.reduce<Record<string, AdminFailedRun[]>>((acc, r) => {
    acc[r.fingerprint] = [...(acc[r.fingerprint] || []), r];
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operations"
        title="Search runs"
        description="Every in-flight and recently failed agent run, with kill switch."
        actions={
          <Button className="w-full sm:w-auto" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => void pull()}>Refresh</Button>
        }
      />

      {error && <Banner tone="danger" title="Error">{error}</Banner>}

      <Card>
        <CardHeader eyebrow="Live" title={`Active runs (${live.length})`} icon={<Activity size={16} />} />
        <CardBody>
          {!live.length ? (
            <EmptyState icon={<Activity size={18} />} title="No active runs" description="Everything is idle." />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:-mx-5 scrollbar-thin">
              <table className="w-full text-sm min-w-[58rem]">
                <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-subtle">
                  <tr>
                    <th className="px-5 py-2">Run</th>
                    <th className="px-2 py-2">User</th>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2">Stage</th>
                    <th className="px-2 py-2 text-right">Queries</th>
                    <th className="px-2 py-2 text-right">Tokens</th>
                    <th className="px-2 py-2 text-right">Elapsed</th>
                    <th className="px-5 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {live.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-bg/30" : ""}>
                      <td className="px-5 py-2.5 font-medium">#{r.id}</td>
                      <td className="px-2 py-2.5 text-subtle">{r.user_email}</td>
                      <td className="px-2 py-2.5">{r.provider}</td>
                      <td className="px-2 py-2.5"><Badge tone="accent">{r.stage}</Badge></td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{r.queries_generated}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{format(r.total_tokens)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{Math.floor(r.elapsed_seconds)}s</td>
                      <td className="px-5 py-2.5 text-right">
                        <Button size="sm" variant="ghost" className="text-danger" leftIcon={<Skull size={13} />} loading={busyId === r.id} onClick={() => void kill(r)}>
                          Kill
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Failures" title={`Failed runs (${failed.length})`} icon={<AlertCircle size={16} />} description="Grouped by error fingerprint to spot regressions." />
        <CardBody>
          {!failed.length ? (
            <EmptyState icon={<AlertCircle size={18} />} title="No failures" description="Nothing has failed recently." />
          ) : (
            <div className="space-y-3">
              {Object.entries(byFingerprint).map(([fp, runs]) => (
                <details key={fp} className="rounded-xl border border-border bg-bg/40">
                  <summary className="cursor-pointer px-4 py-3 flex flex-wrap items-center gap-2">
                    <Badge tone="danger">#{fp}</Badge>
                    <span className="text-sm font-medium">{runs.length} run{runs.length > 1 ? "s" : ""}</span>
                    <span className="text-xs text-subtle truncate">{runs[0].error_message || "—"}</span>
                  </summary>
                  <div className="border-t border-border divide-y divide-border">
                    {runs.map((r) => (
                      <div key={r.id} className="px-4 py-2.5 text-sm flex flex-wrap items-center gap-3">
                        <span className="font-medium">#{r.id}</span>
                        <span className="text-subtle">{r.user_email}</span>
                        <span className="text-subtle">· {r.provider}</span>
                        <span className="text-subtle tabular-nums">· {format(r.total_tokens)} tokens</span>
                        <span className="text-subtle ml-auto text-xs">{r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}</span>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
