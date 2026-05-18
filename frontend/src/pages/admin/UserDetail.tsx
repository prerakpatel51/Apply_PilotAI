import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Coins, FileText, Sparkles } from "lucide-react";
import { adminUserDetail } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminUserDetail } from "../../lib/types";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { Skeleton } from "../../components/ui/Skeleton";

function format(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function AdminUserDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    adminUserDetail(token!, Number(id))
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load user."))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;
  if (error) return <Banner tone="danger" title="Error">{error}</Banner>;
  if (!data) return null;

  const u = data.user;
  const peak = Math.max(1, ...data.daily_tokens.map((d) => d.tokens));

  return (
    <div className="space-y-5">
      <Link to="/app/admin/users" className="text-sm text-subtle hover:text-fg inline-flex items-center gap-1.5">
        <ArrowLeft size={14} /> Back to users
      </Link>

      <Card>
        <CardHeader
          eyebrow={`User #${u.id}`}
          title={u.full_name || u.email}
          description={u.email}
          action={
            <div className="flex gap-2">
              {u.is_admin && <Badge tone="accent">Admin</Badge>}
              {u.is_active === false && <Badge tone="danger">Suspended</Badge>}
            </div>
          }
        />
        <CardBody>
          <div className="grid sm:grid-cols-4 gap-3">
            <Stat icon={<Coins size={14} />} label="Total tokens" value={format(u.total_tokens ?? 0)} />
            <Stat icon={<Briefcase size={14} />} label="Search runs" value={String(u.search_runs ?? 0)} />
            <Stat icon={<FileText size={14} />} label="Extractions" value={String(u.extractions ?? 0)} />
            <Stat icon={<Sparkles size={14} />} label="Provider" value={u.provider ? `${u.provider} · ${u.model ?? ""}` : "—"} />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Last 14 days" title="Daily token usage" />
        <CardBody>
          {data.daily_tokens.length === 0 ? (
            <p className="text-sm text-subtle">No activity in the last 14 days.</p>
          ) : (
            <div className="flex items-end gap-1.5 h-32">
              {data.daily_tokens.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full bg-accent rounded-t" style={{ height: `${(d.tokens / peak) * 100}%` }} title={`${d.date}: ${d.tokens} tokens`} />
                  <span className="text-[10px] text-subtle truncate">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader eyebrow="Profile" title="Candidate profile" />
          <CardBody>
            {data.profile ? (
              <dl className="space-y-2 text-sm">
                {Object.entries(data.profile).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[10rem_1fr] gap-3">
                    <dt className="text-subtle text-xs uppercase tracking-wide">{k}</dt>
                    <dd className="break-words text-fg">{String(v) || "—"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-subtle">No profile saved.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Resumes" title={`Uploaded (${data.resumes.length})`} />
          <CardBody>
            {!data.resumes.length ? (
              <p className="text-sm text-subtle">No resumes uploaded.</p>
            ) : (
              <ul className="space-y-2">
                {data.resumes.map((r) => (
                  <li key={r.id} className="rounded-xl border border-border bg-bg/40 p-3">
                    <p className="text-sm font-medium truncate">{r.file_name}</p>
                    <p className="text-xs text-subtle">{new Date(r.created_at).toLocaleString()}</p>
                    {r.preview && <p className="text-xs text-subtle mt-2 line-clamp-3">{r.preview}</p>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader eyebrow="Search runs" title={`History (${data.runs.length})`} />
        <CardBody>
          {!data.runs.length ? (
            <p className="text-sm text-subtle">No search runs.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:-mx-5 scrollbar-thin">
              <table className="w-full text-sm min-w-[40rem]">
                <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-subtle">
                  <tr>
                    <th className="px-5 py-2">Run</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2 text-right">Tokens</th>
                    <th className="px-2 py-2">Error</th>
                    <th className="px-5 py-2 text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-bg/30" : ""}>
                      <td className="px-5 py-2">#{r.id}</td>
                      <td className="px-2 py-2"><Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "accent"}>{r.status}</Badge></td>
                      <td className="px-2 py-2">{r.provider}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{format(r.total_tokens)}</td>
                      <td className="px-2 py-2 text-xs text-subtle truncate max-w-[14rem]">{r.error_message || "—"}</td>
                      <td className="px-5 py-2 text-right text-subtle text-xs">{new Date(r.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg/40 p-3">
      <div className="flex items-center gap-1.5 text-subtle text-[11px] uppercase tracking-[0.14em] font-medium">
        {icon}
        {label}
      </div>
      <p className="text-lg font-semibold tabular-nums mt-1">{value}</p>
    </div>
  );
}
