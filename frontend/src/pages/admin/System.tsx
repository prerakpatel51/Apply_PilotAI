import { useEffect, useState } from "react";
import { Database, Gauge, RefreshCw, Server } from "lucide-react";
import { adminSystem } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminSystem } from "../../lib/types";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { Skeleton } from "../../components/ui/Skeleton";

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function AdminSystemPage() {
  const { token } = useAuth();
  const [data, setData] = useState<AdminSystem | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await adminSystem(token!));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load system info.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !data) return <Skeleton className="h-64 rounded-2xl" />;
  if (error) return <Banner tone="danger" title="Error">{error}</Banner>;
  if (!data) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="System"
        title="Health & infrastructure"
        actions={<Button className="w-full sm:w-auto" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => void load()}>Refresh</Button>}
      />

      <div className="grid sm:grid-cols-4 gap-3">
        <Stat icon={<Gauge size={14} />} label="Queued" value={String(data.queue.queued)} />
        <Stat icon={<Gauge size={14} />} label="In progress" value={String(data.queue.in_progress)} />
        <Stat icon={<Gauge size={14} />} label="Deferred" value={String(data.queue.deferred)} />
        <Stat
          icon={<Gauge size={14} />}
          label="Oldest pending"
          value={data.queue.oldest_pending_age_seconds != null ? `${Math.floor(data.queue.oldest_pending_age_seconds)}s` : "—"}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader eyebrow="Database" title="Row counts per table" icon={<Database size={16} />} />
          <CardBody>
            <ul className="text-sm divide-y divide-border">
              {Object.entries(data.db_rows).map(([t, n]) => (
                <li key={t} className="flex items-center justify-between py-2">
                  <span className="text-fg font-mono text-xs">{t}</span>
                  <span className="tabular-nums font-semibold">{n.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader eyebrow="Storage" title="Uploaded resumes" icon={<Server size={16} />} />
          <CardBody>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-subtle">Files</span><span className="tabular-nums font-semibold">{data.storage_files.toLocaleString()}</span></div>
              <div className="flex items-center justify-between"><span className="text-subtle">Total size</span><span className="tabular-nums font-semibold">{bytes(data.storage_bytes)}</span></div>
              <div className="flex items-center justify-between"><span className="text-subtle">Queue</span><span className="tabular-nums font-semibold">{data.queue.queue_name}</span></div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-1.5 text-subtle text-[11px] uppercase tracking-[0.14em] font-medium">{icon}{label}</div>
        <p className="text-xl font-semibold tabular-nums mt-1.5">{value}</p>
      </CardBody>
    </Card>
  );
}
