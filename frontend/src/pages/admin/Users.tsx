import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Activity, BanIcon, CheckCircle2, Cpu, ExternalLink, Plus, RefreshCw, Search, Shield, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import { adminCreateUser, adminDeleteUser, adminListUsers, adminUpdateUser } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminUserSummary } from "../../lib/types";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Input";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";

const providerLabel: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic"
};

function format(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function AdminUsersPage() {
  const { user, token } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ email: "", full_name: "", password: "", is_admin: false });

  async function load() {
    setLoading(true);
    setError("");
    try {
      setUsers(await adminListUsers(token!));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return <Navigate to="/signin" replace />;
  if (!user.is_admin) return <Navigate to="/app/search" replace />;

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.toLowerCase();
    return users.filter((u) => (u.email + " " + (u.full_name ?? "")).toLowerCase().includes(q));
  }, [users, query]);

  const totals = useMemo(() => {
    return users.reduce(
      (acc, u) => {
        acc.users += 1;
        acc.admins += u.is_admin ? 1 : 0;
        acc.tokens += u.total_tokens ?? 0;
        acc.runs += u.search_runs ?? 0;
        return acc;
      },
      { users: 0, admins: 0, tokens: 0, runs: 0 }
    );
  }, [users]);

  async function toggleAdmin(target: AdminUserSummary) {
    setBusyId(target.id);
    setError("");
    try {
      await adminUpdateUser(token!, target.id, { is_admin: !target.is_admin });
      setUsers((rows) => rows.map((r) => (r.id === target.id ? { ...r, is_admin: !target.is_admin } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update user.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(target: AdminUserSummary) {
    if (!user || target.id === user.id) return;
    const next = !(target.is_active ?? true);
    const reason = next ? undefined : window.prompt("Reason for suspension?") ?? "Suspended by admin.";
    if (!next && reason === null) return;
    setBusyId(target.id);
    setError("");
    try {
      const updated = await adminUpdateUser(token!, target.id, { is_active: next, suspended_reason: reason });
      setUsers((rows) => rows.map((r) => (r.id === target.id ? { ...r, ...updated } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update user.");
    } finally {
      setBusyId(null);
    }
  }

  async function removeUser(target: AdminUserSummary) {
    if (!user || target.id === user.id) return;
    if (!window.confirm(`Delete ${target.email}? All their data is removed permanently.`)) return;
    setBusyId(target.id);
    setError("");
    try {
      await adminDeleteUser(token!, target.id);
      setUsers((rows) => rows.filter((r) => r.id !== target.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete user.");
    } finally {
      setBusyId(null);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const created = await adminCreateUser(token!, {
        email: createForm.email.trim(),
        password: createForm.password,
        full_name: createForm.full_name.trim() || null,
        is_admin: createForm.is_admin
      });
      setUsers((rows) => [created, ...rows.filter((r) => r.id !== created.id)]);
      setCreateForm({ email: "", full_name: "", password: "", is_admin: false });
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create user.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Manage users"
        description="See all accounts, their model usage, and grant or revoke admin access."
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button className="w-full sm:w-auto" variant="primary" leftIcon={<Plus size={14} />} onClick={() => setShowCreate((value) => !value)}>
              Create user
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" leftIcon={<RefreshCw size={14} />} onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      {error && <Banner tone="danger" title="Admin error">{error}</Banner>}

      {showCreate && (
        <Card>
          <CardHeader
            eyebrow="New account"
            title="Create user"
            description="Create a user directly from the admin panel. The password is set immediately."
          />
          <CardBody>
            <form onSubmit={createUser} className="grid gap-3 items-end md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto_auto]">
              <Field label="Email" required htmlFor="admin-create-email">
                <Input
                  id="admin-create-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((form) => ({ ...form, email: e.target.value }))}
                  placeholder="person@example.com"
                />
              </Field>
              <Field label="Full name" htmlFor="admin-create-name">
                <Input
                  id="admin-create-name"
                  autoComplete="name"
                  value={createForm.full_name}
                  onChange={(e) => setCreateForm((form) => ({ ...form, full_name: e.target.value }))}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Password" required htmlFor="admin-create-password" hint="Minimum 4 characters.">
                <Input
                  id="admin-create-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={4}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((form) => ({ ...form, password: e.target.value }))}
                  placeholder="Temporary password"
                />
              </Field>
              <label className="h-11 flex items-center gap-2 text-sm font-medium text-fg">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border accent-accent"
                  checked={createForm.is_admin}
                  onChange={(e) => setCreateForm((form) => ({ ...form, is_admin: e.target.checked }))}
                />
                Admin
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:col-auto md:col-span-2 xl:col-span-1">
                <Button className="w-full sm:w-auto" type="submit" loading={creating} leftIcon={<Plus size={14} />}>
                  Add
                </Button>
                <Button className="w-full sm:w-auto" type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <div className="grid sm:grid-cols-4 gap-3">
        <SummaryCard icon={<Users size={15} />} eyebrow="Users" value={String(totals.users)} />
        <SummaryCard icon={<Shield size={15} />} eyebrow="Admins" value={String(totals.admins)} />
        <SummaryCard icon={<Search size={15} />} eyebrow="Search runs" value={format(totals.runs)} />
        <SummaryCard icon={<Activity size={15} />} eyebrow="Total tokens" value={format(totals.tokens)} />
      </div>

      <Card>
        <CardHeader
          eyebrow="Accounts"
          title="All users"
          description="Sorted by signup time, newest first."
          action={
            <Input
              placeholder="Search email or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              leftIcon={<Search size={14} />}
              className="w-full sm:w-64"
            />
          }
        />
        <CardBody>
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : !filtered.length ? (
            <EmptyState icon={<Users size={20} />} title="No users found" description="Adjust your search or refresh." />
          ) : (
            <div className="overflow-x-auto scrollbar-thin -mx-4 sm:-mx-5">
              <table className="w-full text-sm min-w-[64rem]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-subtle">
                    <th className="px-5 py-2 font-medium">User</th>
                    <th className="px-2 py-2 font-medium">Role</th>
                    <th className="px-2 py-2 font-medium">Provider</th>
                    <th className="px-2 py-2 font-medium text-right">Runs</th>
                    <th className="px-2 py-2 font-medium text-right">Extractions</th>
                    <th className="px-2 py-2 font-medium text-right">Prompt</th>
                    <th className="px-2 py-2 font-medium text-right">Completion</th>
                    <th className="px-2 py-2 font-medium text-right">Total</th>
                    <th className="px-2 py-2 font-medium">Last active</th>
                    <th className="px-5 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => {
                    const self = u.id === user.id;
                    return (
                      <tr key={u.id} className={i % 2 === 0 ? "bg-bg/30" : ""}>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center text-xs font-semibold shrink-0">
                              {(u.email[0] ?? "U").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{u.full_name || u.email}</p>
                              <p className="text-xs text-subtle truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {u.is_admin ? (
                              <Badge tone="accent"><ShieldCheck size={11} /> Admin</Badge>
                            ) : (
                              <Badge tone="outline"><UserRound size={11} /> User</Badge>
                            )}
                            {u.is_active === false && (
                              <Badge tone="danger"><BanIcon size={11} /> Suspended</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 text-subtle">
                          {u.provider ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Cpu size={12} />
                              <span className="text-fg">{providerLabel[u.provider] ?? u.provider}</span>
                              {u.model && <span className="font-mono text-[11px]">{u.model}</span>}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{u.search_runs ?? 0}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{u.extractions ?? 0}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{format(u.prompt_tokens ?? 0)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums">{format(u.completion_tokens ?? 0)}</td>
                        <td className="px-2 py-2.5 text-right tabular-nums font-semibold">{format(u.total_tokens ?? 0)}</td>
                        <td className="px-2 py-2.5 text-subtle text-xs">
                          {u.last_active_at ? new Date(u.last_active_at).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <Link to={`/app/admin/users/${u.id}`}>
                              <Button size="sm" variant="ghost" leftIcon={<ExternalLink size={13} />}>
                                Detail
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busyId === u.id}
                              disabled={self}
                              onClick={() => toggleAdmin(u)}
                              leftIcon={<ShieldCheck size={13} />}
                            >
                              {u.is_admin ? "Revoke admin" : "Make admin"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busyId === u.id}
                              disabled={self}
                              onClick={() => toggleActive(u)}
                              leftIcon={u.is_active === false ? <CheckCircle2 size={13} /> : <BanIcon size={13} />}
                            >
                              {u.is_active === false ? "Reinstate" : "Suspend"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busyId === u.id}
                              disabled={self}
                              onClick={() => void removeUser(u)}
                              leftIcon={<Trash2 size={13} />}
                              className="text-danger hover:text-danger"
                            >
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SummaryCard({ icon, eyebrow, value }: { icon: React.ReactNode; eyebrow: string; value: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center gap-2 text-subtle text-[11px] uppercase tracking-[0.14em] font-medium">
          {icon}
          {eyebrow}
        </div>
        <p className="text-xl font-semibold tabular-nums mt-1.5">{value}</p>
      </CardBody>
    </Card>
  );
}
