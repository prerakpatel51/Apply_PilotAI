import { useEffect, useState } from "react";
import { Building2, FlaskConical, RefreshCw } from "lucide-react";
import { adminAnalytics } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminAnalytics } from "../../lib/types";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { Skeleton } from "../../components/ui/Skeleton";

export function AdminAnalyticsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<AdminAnalytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await adminAnalytics(token!));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Skeleton className="h-96 rounded-2xl" />;
  if (error) return <Banner tone="danger" title="Error">{error}</Banner>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analytics"
        title="Product metrics"
        description="Funnel, provider/model mix, match quality, job sources, top companies."
        actions={<Button className="w-full sm:w-auto" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => void load()}>Refresh</Button>}
      />

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader eyebrow="Funnel" title="User progression" icon={<FlaskConical size={16} />} />
          <CardBody><FunnelBars data={data.funnel} /></CardBody>
        </Card>
        <Card>
          <CardHeader eyebrow="Match quality" title={`Avg score ${data.match_score_avg}`} />
          <CardBody><BucketBars data={data.match_score_buckets} /></CardBody>
        </Card>
        <Card>
          <CardHeader eyebrow="Providers" title="Active provider mix" />
          <CardBody><MixList data={data.provider_mix} /></CardBody>
        </Card>
        <Card>
          <CardHeader eyebrow="Models" title="Active model mix" />
          <CardBody><MixList data={data.model_mix} /></CardBody>
        </Card>
        <Card>
          <CardHeader eyebrow="Sources" title="Job source breakdown" />
          <CardBody><MixList data={data.job_sources} /></CardBody>
        </Card>
        <Card>
          <CardHeader eyebrow="Companies" title="Top 15 companies" icon={<Building2 size={16} />} />
          <CardBody>
            {data.top_companies.length === 0 ? (
              <p className="text-sm text-subtle">No data yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.top_companies.map((c) => (
                  <li key={c.company} className="flex items-center justify-between gap-3">
                    <span className="truncate">{c.company}</span>
                    <span className="tabular-nums text-subtle">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader eyebrow="Reliability" title="Resume parse failures" />
          <CardBody>
            <p className="text-3xl font-semibold tabular-nums">{data.resume_parse_failures}</p>
            <p className="text-xs text-subtle mt-1">Resumes with no readable text after upload.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader eyebrow="Search yield" title="Runs with results vs none" />
          <CardBody>
            <YieldBar data={data.search_yield} />
          </CardBody>
        </Card>
      </div>
    </div>
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
              <span className="tabular-nums"><span className="font-semibold">{v}</span> <span className="text-subtle">· {conv}%</span></span>
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

function BucketBars({ data }: { data: Record<string, number> }) {
  const order = ["0-49", "50-69", "70-84", "85-94", "95-100"];
  const peak = Math.max(1, ...order.map((k) => data[k] ?? 0));
  return (
    <div className="space-y-2">
      {order.map((k) => (
        <div key={k}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-subtle">{k}</span>
            <span className="tabular-nums font-semibold">{data[k] ?? 0}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${((data[k] ?? 0) / peak) * 100}%` }} />
          </div>
        </div>
      ))}
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
            <span className="font-medium truncate max-w-[16rem]">{k}</span>
            <span className="tabular-nums text-subtle">{v} · {Math.round((v / total) * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${(v / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function YieldBar({ data }: { data: { with_results: number; no_results: number } }) {
  const total = (data.with_results + data.no_results) || 1;
  return (
    <div>
      <div className="h-3 rounded-full bg-muted overflow-hidden flex">
        <div className="h-full bg-success" style={{ width: `${(data.with_results / total) * 100}%` }} />
        <div className="h-full bg-warn" style={{ width: `${(data.no_results / total) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between mt-2 text-sm">
        <span><span className="inline-block w-2 h-2 rounded-full bg-success mr-2" />With results: <strong>{data.with_results}</strong></span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-warn mr-2" />No results: <strong>{data.no_results}</strong></span>
      </div>
    </div>
  );
}
