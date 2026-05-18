import { useEffect, useState } from "react";
import { RefreshCw, RotateCcw, Save, SlidersHorizontal } from "lucide-react";
import { adminListAgentPrompts, adminResetAgentPrompt, adminUpdateAgentPrompt } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminAgentPrompt } from "../../lib/types";
import { PageHeader } from "../../components/PageHeader";
import { Banner } from "../../components/ui/Banner";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

export function AdminPromptsPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<AdminAgentPrompt[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState<AdminAgentPrompt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const selected = items.find((item) => item.agent_key === selectedKey) ?? items[0] ?? null;

  async function load() {
    if (!token) return;
    setBusy("load");
    setError("");
    try {
      const rows = await adminListAgentPrompts(token);
      setItems(rows);
      const next = rows.find((item) => item.agent_key === selectedKey) ?? rows[0] ?? null;
      setSelectedKey(next?.agent_key ?? "");
      setDraft(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load agent prompts.");
    } finally {
      setLoading(false);
      setBusy("");
    }
  }

  async function save() {
    if (!token || !draft) return;
    setBusy("save");
    setError("");
    setMessage("");
    try {
      const updated = await adminUpdateAgentPrompt(token, draft.agent_key, {
        system_prompt: draft.system_prompt,
        task_template: draft.task_template,
        extra_instructions: draft.extra_instructions,
        is_enabled: draft.is_enabled
      });
      setItems((rows) => rows.map((row) => (row.agent_key === updated.agent_key ? updated : row)));
      setDraft(updated);
      setMessage("Prompt saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save prompt.");
    } finally {
      setBusy("");
    }
  }

  async function reset() {
    if (!token || !draft) return;
    if (!window.confirm(`Reset ${draft.label} to the default prompt?`)) return;
    setBusy("reset");
    setError("");
    setMessage("");
    try {
      const updated = await adminResetAgentPrompt(token, draft.agent_key);
      setItems((rows) => rows.map((row) => (row.agent_key === updated.agent_key ? updated : row)));
      setDraft(updated);
      setMessage("Prompt reset to default.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset prompt.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  useEffect(() => {
    if (selected) setDraft(selected);
  }, [selectedKey, selected?.updated_at]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Agent control"
        title="Prompts"
        description="Modify system prompts and admin instructions for every agent without changing code."
        actions={
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void load()} loading={busy === "load"} leftIcon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        }
      />

      {error && <Banner tone="danger" title="Prompt error">{error}</Banner>}
      {message && <Banner tone="success" title="Saved">{message}</Banner>}

      {loading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : (
        <div className="grid lg:grid-cols-[18rem_1fr] gap-5">
          <Card>
            <CardHeader eyebrow="Agents" title="Editable prompts" icon={<SlidersHorizontal size={16} />} />
            <CardBody className="flex gap-2 overflow-x-auto lg:block lg:space-y-2 lg:overflow-visible">
              {items.map((item) => (
                <button
                  key={item.agent_key}
                  type="button"
                  onClick={() => setSelectedKey(item.agent_key)}
                  className={`min-w-[13rem] rounded-xl border p-3 text-left transition-colors lg:w-full ${
                    selectedKey === item.agent_key ? "border-accent bg-accent/8" : "border-border bg-bg/40 hover:bg-muted"
                  }`}
                >
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-subtle font-mono mt-1 break-anywhere">{item.agent_key}</p>
                </button>
              ))}
            </CardBody>
          </Card>

          <Card>
              <CardHeader
              eyebrow={draft?.agent_key}
              title={draft?.label ?? "Prompt"}
              description="Use placeholders such as {resume_content}, {jd}, {extracted_profile}, and {locked_template} where available."
              action={
                draft && (
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                    <Button variant="outline" size="sm" onClick={() => void reset()} loading={busy === "reset"} leftIcon={<RotateCcw size={14} />}>
                      Reset
                    </Button>
                    <Button size="sm" onClick={() => void save()} loading={busy === "save"} leftIcon={<Save size={14} />}>
                      Save
                    </Button>
                  </div>
                )
              }
            />
            <CardBody className="space-y-4">
              {draft && (
                <>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.is_enabled}
                      onChange={(event) => setDraft({ ...draft, is_enabled: event.target.checked })}
                      className="h-4 w-4 rounded border-border"
                    />
                    Apply this prompt configuration
                  </label>

                  <div>
                    <label className="text-sm font-medium">System prompt</label>
                    <textarea
                      className="mt-2 h-56 w-full resize-y rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-accent/30 scrollbar-thin"
                      value={draft.system_prompt}
                      onChange={(event) => setDraft({ ...draft, system_prompt: event.target.value })}
                      spellCheck={false}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Full task prompt template</label>
                    <textarea
                      className="mt-2 h-[22rem] w-full resize-y rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-accent/30 scrollbar-thin sm:h-[30rem]"
                      value={draft.task_template}
                      onChange={(event) => setDraft({ ...draft, task_template: event.target.value })}
                      placeholder="Full task prompt template. Runtime placeholders are replaced by the backend."
                      spellCheck={false}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Additional instructions</label>
                    <textarea
                      className="mt-2 h-48 w-full resize-y rounded-xl border border-border bg-bg p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-accent/30 scrollbar-thin"
                      value={draft.extra_instructions}
                      onChange={(event) => setDraft({ ...draft, extra_instructions: event.target.value })}
                      placeholder="Optional instructions appended to this agent's task prompt."
                      spellCheck={false}
                    />
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
