import { useEffect, useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { adminAudit } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminAuditEntry } from "../../lib/types";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardBody } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";

export function AdminAuditPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminAuditEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await adminAudit(token!));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audit log.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Audit"
        title="Admin actions"
        description="Every admin action with timestamp. Append-only."
        actions={<Button className="w-full sm:w-auto" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => void load()}>Refresh</Button>}
      />
      {error && <Banner tone="danger" title="Error">{error}</Banner>}
      <Card>
        <CardBody>
          {loading ? (
            <p className="text-sm text-subtle">Loading…</p>
          ) : !rows.length ? (
            <EmptyState icon={<ScrollText size={18} />} title="No audit entries" description="Actions you take will appear here." />
          ) : (
            <div className="overflow-x-auto -mx-4 sm:-mx-5 scrollbar-thin">
              <table className="w-full text-sm min-w-[44rem]">
                <thead className="text-left text-[11px] uppercase tracking-[0.14em] text-subtle">
                  <tr>
                    <th className="px-5 py-2">When</th>
                    <th className="px-2 py-2">Actor</th>
                    <th className="px-2 py-2">Action</th>
                    <th className="px-2 py-2">Target</th>
                    <th className="px-5 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} className={i % 2 === 0 ? "bg-bg/30" : ""}>
                      <td className="px-5 py-2 text-xs text-subtle whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-2 py-2">{r.actor_email ?? `#${r.actor_id ?? "?"}`}</td>
                      <td className="px-2 py-2"><Badge tone="outline">{r.action}</Badge></td>
                      <td className="px-2 py-2 text-subtle">{r.target_type ? `${r.target_type}#${r.target_id ?? "?"}` : "—"}</td>
                      <td className="px-5 py-2 text-xs text-subtle font-mono break-words max-w-[24rem]">
                        {Object.keys(r.detail).length ? JSON.stringify(r.detail) : "—"}
                      </td>
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
