import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  CheckCircle2,
  FileText,
  KeyRound,
  Lock,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2
} from "lucide-react";
import { clearSessionProviderKey, deleteProvider, listProviders, saveProvider, setSessionProviderKey } from "../lib/api";
import type { ProviderName } from "../lib/types";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Input";
import { Banner } from "../components/ui/Banner";
import { Badge } from "../components/ui/Badge";
import { Card, CardBody, CardHeader } from "../components/ui/Card";

const defaultModels: Record<ProviderName, string> = {
  openai: "gpt-5.4",
  anthropic: "claude-opus-4-7"
};

const providerCopy: Record<
  ProviderName,
  { label: string; tagline: string; bullets: string[]; keyHint: string; docs: string }
> = {
  openai: {
    label: "OpenAI",
    tagline: "GPT-5.4 / GPT-5.5 access · native web_search tool",
    bullets: [
      "Best for live job-listing retrieval (built-in web_search).",
      "Strong reasoning, structured JSON output, and resume alignment.",
      "Pay-per-token via api.openai.com."
    ],
    keyHint: "sk-... key from platform.openai.com",
    docs: "https://platform.openai.com/api-keys"
  },
  anthropic: {
    label: "Anthropic",
    tagline: "Claude 4 family · web_search_20250305",
    bullets: [
      "Best for resume / JD analysis and structured output.",
      "Reliable web search via Claude's tool API.",
      "Pay-per-token via console.anthropic.com."
    ],
    keyHint: "sk-ant-... key from console.anthropic.com",
    docs: "https://console.anthropic.com/settings/keys"
  }
};

const modelOptions: Record<ProviderName, { label: string; value: string; recommended?: boolean }[]> = {
  openai: [
    { label: "GPT-5.4", value: "gpt-5.4", recommended: true },
    { label: "GPT-5.5", value: "gpt-5.5" },
    { label: "GPT-5.4 Mini", value: "gpt-5.4-mini" },
    { label: "GPT-5.4 Nano", value: "gpt-5.4-nano" },
    { label: "GPT-5.2", value: "gpt-5.2" },
    { label: "GPT-5.2 Pro", value: "gpt-5.2-pro" },
    { label: "GPT-5.2 Codex", value: "gpt-5.2-codex" },
    { label: "GPT-5 Mini", value: "gpt-5-mini" },
    { label: "GPT-5 Nano", value: "gpt-5-nano" }
  ],
  anthropic: [
    { label: "Claude Opus 4.7", value: "claude-opus-4-7", recommended: true },
    { label: "Claude Sonnet 4.6", value: "claude-sonnet-4-6" },
    { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
    { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514" },
    { label: "Claude Opus 4.1", value: "claude-opus-4-1-20250805" }
  ]
};

type TaskKey = "resume_extraction" | "resume_alignment" | "keyword_generation" | "job_search" | "ranking";

const taskFields: { key: TaskKey; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    key: "resume_extraction",
    label: "Resume extraction",
    hint: "Parses your resume into a structured profile.",
    icon: <Brain size={14} />
  },
  {
    key: "resume_alignment",
    label: "Resume alignment",
    hint: "Generates a job-specific LaTeX resume from your master resume.",
    icon: <FileText size={14} />
  },
  {
    key: "keyword_generation",
    label: "Search query generation",
    hint: "Builds role + ATS site queries from your profile.",
    icon: <Wand2 size={14} />
  },
  {
    key: "job_search",
    label: "Live job search",
    hint: "Calls the model's web_search tool to fetch current listings.",
    icon: <Sparkles size={14} />
  },
  {
    key: "ranking",
    label: "Ranking & gap analysis",
    hint: "Scores fit and writes resume alignment notes.",
    icon: <CheckCircle2 size={14} />
  }
];

function isKnownModel(provider: ProviderName, value: string) {
  return modelOptions[provider].some((o) => o.value === value);
}

function supportedModelFor(provider: ProviderName, value?: string | null) {
  return value && isKnownModel(provider, value) ? value : defaultModels[provider];
}

function normalizedTaskModels(
  provider: ProviderName,
  values?: Record<string, string> | null,
  fallback?: string | null
): Record<TaskKey, string> {
  const fallbackModel = supportedModelFor(provider, fallback);
  return taskFields.reduce((acc, task) => {
    acc[task.key] = supportedModelFor(provider, values?.[task.key] ?? fallbackModel);
    return acc;
  }, {} as Record<TaskKey, string>);
}

export function ProviderPage() {
  const { token } = useAuth();
  const { providers, setProviders } = useWorkspace();
  const active = providers.find((p) => p.is_active);
  const activeProvider = (active?.provider as ProviderName | undefined) ?? "openai";
  const [provider, setProvider] = useState<ProviderName>(activeProvider);
  const [apiKey, setApiKey] = useState("");
  const [taskModels, setTaskModels] = useState<Record<TaskKey, string>>(
    normalizedTaskModels(activeProvider, active?.task_models, active?.model)
  );
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const savedForProvider = useMemo(() => providers.find((p) => p.provider === provider), [provider, providers]);

  useEffect(() => {
    if (!active) return;
    const nextProvider = active.provider as ProviderName;
    setProvider(nextProvider);
    setTaskModels(normalizedTaskModels(nextProvider, active.task_models, active.model));
  }, [active?.id]);

  function switchProvider(next: ProviderName) {
    const saved = providers.find((p) => p.provider === next);
    setProvider(next);
    setTaskModels(normalizedTaskModels(next, saved?.task_models, saved?.model));
    setApiKey("");
    setMessage("");
    setError("");
  }

  function bumpAllTaskModels(value: string) {
    setTaskModels({
      resume_extraction: value,
      resume_alignment: value,
      keyword_generation: value,
      job_search: value,
      ranking: value
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const normalizedTasks = normalizedTaskModels(provider, taskModels, taskModels.job_search);
      await saveProvider(token!, {
        provider,
        api_key: apiKey,
        model: normalizedTasks.job_search,
        task_models: normalizedTasks
      });
      setSessionProviderKey(provider, apiKey);
      setApiKey("");
      setMessage("Provider saved. Your key is kept in this browser session only, not in the database.");
      setProviders(await listProviders(token!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save provider.");
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    if (!savedForProvider) return;
    if (!window.confirm(`Remove the saved ${providerCopy[provider].label} key?`)) return;
    setError("");
    setMessage("");
    setRemoving(true);
    try {
      await deleteProvider(token!, savedForProvider.id);
      clearSessionProviderKey();
      setApiKey("");
      setMessage("Provider removed. Session key cleared.");
      setProviders(await listProviders(token!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove API key.");
    } finally {
      setRemoving(false);
    }
  }

  const allSameModel = new Set(Object.values(taskModels)).size === 1;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        eyebrow="Step 1"
        title="Connect your model provider"
        description="Bring your own key. The database stores only provider and model settings; the key stays in this browser session."
      />

      {message && <Banner tone="success">{message}</Banner>}
      {error && <Banner tone="danger" title="Could not save">{error}</Banner>}

      {/* Provider tiles */}
      <div className="grid sm:grid-cols-2 gap-3">
        {(Object.keys(providerCopy) as ProviderName[]).map((p) => {
          const selected = provider === p;
          const saved = providers.some((x) => x.provider === p);
          const active = providers.some((x) => x.provider === p && x.is_active);
          return (
            <button
              key={p}
              type="button"
              onClick={() => switchProvider(p)}
              className={
                "text-left rounded-2xl border p-5 transition-all " +
                (selected
                  ? "border-accent bg-accent/8 shadow-soft"
                  : "border-border hover:border-fg/20 hover:bg-muted/40")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">{providerCopy[p].label}</p>
                  <p className="text-xs text-subtle mt-0.5">{providerCopy[p].tagline}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {active && <Badge tone="success">Active</Badge>}
                  {saved && !active && <Badge tone="outline">Saved</Badge>}
                </div>
              </div>
              <ul className="mt-4 space-y-1.5 text-xs text-subtle">
                {providerCopy[p].bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Saved-key state */}
      {savedForProvider && (
        <Card className="border-success/30 bg-success/5">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="h-9 w-9 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0">
              <ShieldCheck size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{providerCopy[provider].label} provider configured</p>
              <p className="text-xs text-subtle truncate">
                No API key stored in the database · Default model: <code className="text-fg break-anywhere">{savedForProvider.model}</code> ·
                {savedForProvider.is_active ? " active" : " inactive"} ·
                updated {new Date(savedForProvider.updated_at).toLocaleString()}
              </p>
            </div>
            <Button className="w-full sm:w-auto" variant="ghost" size="sm" onClick={removeKey} loading={removing} leftIcon={<Trash2 size={14} />}>
              Remove
            </Button>
          </CardBody>
        </Card>
      )}

      {/* Form */}
      <Card>
        <CardHeader
          eyebrow={savedForProvider ? "Update" : "Connect"}
          title={`${providerCopy[provider].label} credentials`}
          icon={<KeyRound size={18} />}
        />
        <CardBody className="space-y-5">
          <Field
            label="API key"
            required
            hint={
              <span>
                {providerCopy[provider].keyHint} ·{" "}
                <a
                  href={providerCopy[provider].docs}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  Get one
                </a>
              </span>
            }
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={`Paste your ${providerCopy[provider].label} key`}
              autoComplete="off"
              required
              leftIcon={<Lock size={16} />}
            />
          </Field>

          {/* Default model picker (single) */}
          <Field
            label="Default model"
            hint="Used for every agent stage unless you set per-task overrides below."
          >
            <Select
              value={allSameModel ? taskModels.job_search : "__custom__"}
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setAdvanced(true);
                } else {
                  bumpAllTaskModels(e.target.value);
                }
              }}
            >
              {modelOptions[provider].map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                  {o.recommended ? " — recommended" : ""}
                </option>
              ))}
              <option value="__custom__">Per-task models…</option>
            </Select>
          </Field>

          {/* Advanced per-task model selectors */}
          {(advanced || !allSameModel) && (
            <div className="rounded-2xl border border-border bg-bg/40 p-4 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold">Per-task models</p>
                <Button
                  className="w-full sm:w-auto"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    bumpAllTaskModels(taskModels.job_search);
                    setAdvanced(false);
                  }}
                >
                  Use one model everywhere
                </Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {taskFields.map((task) => (
                  <div key={task.key}>
                    <div className="flex items-center gap-1.5 text-xs text-subtle mb-1.5">
                      <span className="text-fg">{task.icon}</span>
                      <span className="font-medium text-fg">{task.label}</span>
                    </div>
                    <Select
                      value={taskModels[task.key]}
                      onChange={(e) =>
                        setTaskModels((cur) => ({ ...cur, [task.key]: e.target.value }))
                      }
                    >
                      {modelOptions[provider].map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                          {o.recommended ? " — recommended" : ""}
                        </option>
                      ))}
                    </Select>
                    <p className="text-[11px] text-subtle mt-1">{task.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4 border-t border-border -mx-4 px-4 sm:-mx-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-subtle inline-flex items-start gap-1.5 break-anywhere">
              <ShieldCheck size={13} className="text-success" /> Key stays in session storage and is sent only to run model actions.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {active && (
                <Link to="/app/profile" className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto" variant="ghost" rightIcon={<ArrowRight size={14} />}>Continue to profile</Button>
                </Link>
              )}
              <Button className="w-full sm:w-auto" type="button" onClick={submit} loading={saving} leftIcon={<Save size={16} />}>
                {savedForProvider ? "Update provider" : "Save provider"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
