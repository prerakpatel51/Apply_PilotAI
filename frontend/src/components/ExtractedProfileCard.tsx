import { useEffect, useState } from "react";
import {
  Award,
  Briefcase,
  Code2,
  FileText,
  GraduationCap,
  KeyRound,
  Languages,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Target,
  TriangleAlert,
  Wrench
} from "lucide-react";
import { extractResume, getResumeExtraction, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTokenometer } from "../lib/tokenometer";
import { useWorkspace } from "../lib/workspace";
import type { ResumeExtraction } from "../lib/types";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";

export function ExtractedProfileCard() {
  const { token } = useAuth();
  const { resumes, providers } = useWorkspace();
  const { refresh: refreshTokens } = useTokenometer();
  const latest = resumes[0];
  const hasProvider = providers.some((p) => p.is_active);
  const [extraction, setExtraction] = useState<ResumeExtraction | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!latest) {
      setExtraction(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    getResumeExtraction(token!, latest.id)
      .then((data) => {
        if (!cancelled) setExtraction(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!(err instanceof ApiError && err.status === 404)) {
          setError(err instanceof Error ? err.message : "Could not load extracted profile.");
        }
        setExtraction(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [latest?.id, token]);

  async function runExtraction() {
    if (!latest) return;
    setError("");
    setRunning(true);
    try {
      const data = await extractResume(token!, latest.id);
      setExtraction(data);
      void refreshTokens();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not extract profile.");
    } finally {
      setRunning(false);
    }
  }

  if (!latest) {
    return (
      <Card>
        <CardHeader
          eyebrow="From your resume"
          title="Extracted candidate profile"
          icon={<FileText size={18} />}
        />
        <CardBody>
          <EmptyState
            icon={<FileText size={20} />}
            title="No resume yet"
            description="Upload a resume on the Resume page, then come back to extract a structured profile."
          />
        </CardBody>
      </Card>
    );
  }

  const tokens = extraction?.token_usage?.total_tokens;

  return (
    <Card>
      <CardHeader
        eyebrow="From your resume"
        title="Extracted candidate profile"
        description={
          extraction
            ? `Parsed by ${extraction.model || "your model"}${tokens ? ` · ${tokens.toLocaleString()} tokens` : ""}.`
            : "Run an agent to turn your resume into a structured profile you can review."
        }
        icon={<Sparkles size={18} className="text-accent" />}
        action={
          <Button
            onClick={runExtraction}
            loading={running}
            disabled={!hasProvider}
            leftIcon={extraction ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            size="sm"
          >
            {extraction ? "Re-extract" : "Extract profile"}
          </Button>
        }
      />
      <CardBody className="space-y-5">
        {!hasProvider && (
          <Banner tone="warn" title="Connect a provider first">
            Extraction uses your saved model provider. Set one up on the Provider page.
          </Banner>
        )}
        {error && <Banner tone="danger" title="Extraction error">{error}</Banner>}

        {loading ? (
          <ExtractedSkeleton />
        ) : extraction ? (
          <ExtractedBody data={extraction} />
        ) : (
          <EmptyState
            icon={<Sparkles size={20} />}
            title="No structured profile yet"
            description="Click ‘Extract profile’ above to parse your resume into skills, experience, projects, strengths, and gaps."
          />
        )}
      </CardBody>
    </Card>
  );
}

function ExtractedBody({ data }: { data: ResumeExtraction }) {
  const p = data.payload || {};
  return (
    <div className="space-y-6">
      {(p.headline || p.summary || p.years_experience) && (
        <div className="rounded-2xl border border-border bg-bg/40 p-5">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {p.years_experience && (
              <Badge tone="accent">
                <Briefcase size={11} /> {p.years_experience}
              </Badge>
            )}
            {data.file_name && <Badge tone="outline">{data.file_name}</Badge>}
          </div>
          {p.headline && <p className="text-lg font-semibold text-fg leading-snug">{p.headline}</p>}
          {p.summary && <p className="text-sm text-subtle mt-2 leading-relaxed">{p.summary}</p>}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <ChipBlock icon={<Target size={14} />} title="Core skills" tone="accent" items={p.skills} />
        <ChipBlock icon={<Wrench size={14} />} title="Tools & tech" tone="neutral" items={p.tools} />
        <ChipBlock icon={<Languages size={14} />} title="Languages" tone="neutral" items={p.languages} />
        <ChipBlock icon={<KeyRound size={14} />} title="ATS keywords" tone="outline" items={p.keywords} />
      </div>

      {p.experience?.length ? (
        <Section icon={<Briefcase size={15} />} title="Experience">
          <ol className="relative border-l border-border ml-2 space-y-5 pl-5">
            {p.experience.map((e, i) => (
              <li key={`${e.company ?? "exp"}-${i}`} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-4 ring-bg" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-semibold text-fg">{e.title || "Role"}</p>
                  {e.company && <p className="text-sm text-subtle">· {e.company}</p>}
                </div>
                <p className="text-xs text-subtle mt-0.5">
                  {[e.start, e.end].filter(Boolean).join(" – ")}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
                {e.highlights?.length ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {e.highlights.map((h, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                        <span className="text-fg/90">{h}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {p.education?.length ? (
        <Section icon={<GraduationCap size={15} />} title="Education">
          <div className="grid sm:grid-cols-2 gap-3">
            {p.education.map((e, i) => (
              <div key={`${e.school ?? "edu"}-${i}`} className="rounded-xl border border-border bg-bg/40 p-3">
                <p className="text-sm font-semibold">
                  {[e.degree, e.field].filter(Boolean).join(", ") || "Degree"}
                </p>
                <p className="text-xs text-subtle mt-0.5">{e.school || "—"}</p>
                {(e.start || e.end) && (
                  <p className="text-xs text-subtle">{[e.start, e.end].filter(Boolean).join(" – ")}</p>
                )}
                {e.details && <p className="text-xs text-fg/90 mt-1.5">{e.details}</p>}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {p.projects?.length ? (
        <Section icon={<Code2 size={15} />} title="Projects">
          <div className="grid sm:grid-cols-2 gap-3">
            {p.projects.map((proj, i) => (
              <div key={`${proj.name ?? "proj"}-${i}`} className="rounded-xl border border-border bg-bg/40 p-3">
                <p className="text-sm font-semibold">{proj.name || "Project"}</p>
                {proj.summary && <p className="text-xs text-subtle mt-1 leading-relaxed">{proj.summary}</p>}
                {proj.tech?.length ? (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {proj.tech.map((t) => (
                      <Badge key={t} tone="outline">{t}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {p.certifications?.length ? (
        <Section icon={<Award size={15} />} title="Certifications">
          <div className="flex flex-wrap gap-1.5">
            {p.certifications.map((c) => (
              <Badge key={c} tone="neutral">{c}</Badge>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-4">
        {p.strengths?.length ? (
          <div className="rounded-2xl border border-success/30 bg-success/8 p-4">
            <div className="flex items-center gap-2 mb-2 text-success">
              <Lightbulb size={15} />
              <p className="text-sm font-semibold">Resume strengths</p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {p.strengths.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-success shrink-0" />
                  <span className="text-fg/90">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {p.gaps?.length ? (
          <div className="rounded-2xl border border-warn/30 bg-warn/8 p-4">
            <div className="flex items-center gap-2 mb-2 text-warn">
              <TriangleAlert size={15} />
              <p className="text-sm font-semibold">Areas to strengthen</p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {p.gaps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-warn shrink-0" />
                  <span className="text-fg/90">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChipBlock({
  icon,
  title,
  items,
  tone
}: {
  icon: React.ReactNode;
  title: string;
  items?: string[];
  tone: "accent" | "neutral" | "outline";
}) {
  if (!items?.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-bg/40 p-4 min-w-0">
      <div className="flex items-center gap-2 text-subtle mb-2.5">
        <span className="text-fg">{icon}</span>
        <p className="text-[11px] uppercase tracking-[0.14em] font-medium">{title}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((s) => (
          <Badge key={s} tone={tone} className="max-w-full">
            <span className="truncate">{s}</span>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-fg">
        <span className="text-accent">{icon}</span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function ExtractedSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid sm:grid-cols-2 gap-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

