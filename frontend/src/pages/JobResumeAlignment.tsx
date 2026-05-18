import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Sparkles
} from "lucide-react";
import {
  compileGeneratedResume,
  generateResumeForMatch,
  generatedResumeDownloadUrl,
  getMatch,
  listGeneratedResumes,
  updateGeneratedResume
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type { GeneratedResume, JobMatch } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";

export function JobResumeAlignmentPage() {
  const { token } = useAuth();
  const params = useParams();
  const runId = Number(params.runId);
  const matchId = Number(params.matchId);
  const [match, setMatch] = useState<JobMatch | null>(null);
  const [generated, setGenerated] = useState<GeneratedResume[]>([]);
  const [active, setActive] = useState<GeneratedResume | null>(null);
  const [latex, setLatex] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [jdOverride, setJdOverride] = useState("");
  const [jdOpen, setJdOpen] = useState(false);

  const dirty = !!active && latex !== active.latex_source;

  useEffect(() => {
    if (!token || !runId || !matchId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([getMatch(token, runId, matchId), listGeneratedResumes(token, matchId)])
      .then(([jobMatch, resumes]) => {
        if (cancelled) return;
        setMatch(jobMatch);
        setGenerated(resumes);
        const first = resumes[0] ?? null;
        setActive(first);
        setLatex(first?.latex_source ?? "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load job."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, runId, matchId]);

  useEffect(() => {
    setPdfUrl("");
    if (!token || !active?.has_pdf) {
      return;
    }
    let objectUrl = "";
    fetch(generatedResumeDownloadUrl(active.id, "pdf"), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("Could not load PDF preview."))))
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch(() => setPdfUrl(""));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [token, active?.id, active?.has_pdf]);

  async function generate() {
    if (!token) return;
    setBusy("generate");
    setError("");
    try {
      const item = await generateResumeForMatch(token, matchId, jdOverride);
      setGenerated((items) => [item, ...items]);
      setActive(item);
      setLatex(item.latex_source);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate resume.");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!token || !active) return;
    setBusy("save");
    setError("");
    try {
      const item = await updateGeneratedResume(token, active.id, latex);
      replaceGenerated(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save resume.");
    } finally {
      setBusy("");
    }
  }

  async function compile() {
    if (!token || !active) return;
    setBusy("compile");
    setError("");
    try {
      const saved = dirty ? await updateGeneratedResume(token, active.id, latex) : active;
      const item = await compileGeneratedResume(token, saved.id);
      replaceGenerated(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not compile resume.");
    } finally {
      setBusy("");
    }
  }

  async function download(kind: "tex" | "pdf") {
    if (!token || !active) return;
    const response = await fetch(generatedResumeDownloadUrl(active.id, kind), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      setError(`Could not download ${kind.toUpperCase()}.`);
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${active.file_base}.${kind}`;
    link.click();
    URL.revokeObjectURL(href);
  }

  function replaceGenerated(item: GeneratedResume) {
    setActive(item);
    setLatex(item.latex_source);
    setGenerated((items) => items.map((existing) => (existing.id === item.id ? item : existing)));
  }

  if (loading) {
    return <Skeleton className="h-[36rem] rounded-2xl" />;
  }

  if (!match) {
    return (
      <EmptyState
        icon={<FileText size={20} />}
        title="Job match not found"
        description={error || "This job match is no longer available."}
        action={<Link to="/app/jobs"><Button leftIcon={<ArrowLeft size={14} />}>Back to jobs</Button></Link>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Match ${Math.round(match.score)} / 100`}
        title={match.job.title}
        description={`${match.job.company}${match.job.location ? ` · ${match.job.location}` : ""}`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <Link to="/app/jobs" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto" variant="outline" leftIcon={<ArrowLeft size={14} />}>Jobs</Button>
            </Link>
            <Button className="w-full sm:w-auto" onClick={generate} loading={busy === "generate"} leftIcon={<Sparkles size={14} />}>
              Generate aligned resume
            </Button>
          </div>
        }
      />

      {error && <Banner tone="danger" title="Resume alignment error">{error}</Banner>}

      <Card>
        <CardHeader
          eyebrow="Custom job description"
          title="Paste a JD to override the scraped one"
          description="Use this when the scraped listing is missing or stale. Pasted text is treated as untrusted data — instructions inside it will not be followed by the agent."
          action={
            <Button variant="ghost" size="sm" onClick={() => setJdOpen((v) => !v)}>
              {jdOpen ? "Hide" : "Show"}
            </Button>
          }
        />
        {jdOpen && (
          <CardBody className="space-y-2">
            <textarea
              className="h-48 w-full resize-y rounded-xl border border-border bg-bg p-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-accent/30 scrollbar-thin"
              placeholder="Paste the full job description here. Leave empty to use the scraped JD."
              value={jdOverride}
              onChange={(e) => setJdOverride(e.target.value.slice(0, 24000))}
              spellCheck={false}
              maxLength={24000}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-subtle">
              <span>{jdOverride.length}/24000 chars</span>
              {jdOverride && (
                <Button variant="ghost" size="sm" onClick={() => setJdOverride("")}>Clear</Button>
              )}
            </div>
          </CardBody>
        )}
      </Card>

      <JobIntelligence match={match} />

      <div className="grid xl:grid-cols-[18rem_1fr] gap-5">
        <PreviousResumes
          items={generated}
          activeId={active?.id ?? null}
          onSelect={(item) => {
            setActive(item);
            setLatex(item.latex_source);
          }}
        />

        <Card className="overflow-hidden">
          <CardHeader
            eyebrow="Resume workspace"
            title={active ? active.file_base : "No generated resume yet"}
            description={active ? statusText(active) : "Generate an aligned LaTeX resume for this job."}
            action={
              active && (
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
                  <Button variant="outline" size="sm" onClick={save} loading={busy === "save"} leftIcon={<Save size={14} />}>
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={compile} loading={busy === "compile"} leftIcon={<RefreshCw size={14} />}>
                    Recompile
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void download("tex")} leftIcon={<Download size={14} />}>
                    LaTeX
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void download("pdf")} disabled={!active.has_pdf} leftIcon={<Download size={14} />}>
                    PDF
                  </Button>
                </div>
              )
            }
          />
          <CardBody>
            {active ? (
              <div className="grid lg:grid-cols-2 gap-4">
                <textarea
                  className="h-[28rem] w-full resize-none rounded-xl border border-border bg-bg p-3 sm:p-4 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-accent/30 scrollbar-thin lg:h-[42rem]"
                  value={latex}
                  onChange={(event) => setLatex(event.target.value)}
                  spellCheck={false}
                />
                <div className="h-[28rem] rounded-xl border border-border bg-bg overflow-hidden lg:h-[42rem]">
                  {busy === "compile" ? (
                    <div className="h-full grid place-items-center text-subtle">
                      <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} />Compiling PDF</span>
                    </div>
                  ) : pdfUrl ? (
                    <iframe title="Resume PDF preview" src={pdfUrl} className="h-full w-full bg-white" />
                  ) : (
                    <div className="h-full p-4 overflow-auto scrollbar-thin">
                      <p className="text-sm font-medium">PDF preview unavailable</p>
                      <p className="text-sm text-subtle mt-1">{active.compile_log || "Recompile after editing to generate a PDF."}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Sparkles size={20} />}
                title="Generate a job-specific resume"
                description="The agent will keep the locked LaTeX format, use your resume and extracted profile, and tailor the content to this JD."
                action={<Button className="w-full sm:w-auto" onClick={generate} loading={busy === "generate"} leftIcon={<Sparkles size={14} />}>Generate aligned resume</Button>}
              />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function JobIntelligence({ match }: { match: JobMatch }) {
  return (
    <div className="grid xl:grid-cols-[1fr_1fr] gap-5">
      <Card>
        <CardHeader
          eyebrow="Job description"
          title="Role details"
          description={match.job.url ? "Source listing and extracted requirements." : undefined}
          action={
            match.job.url && (
              <a href={match.job.url} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" rightIcon={<ExternalLink size={14} />}>Listing</Button>
              </a>
            )
          }
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {match.job.source && <Badge tone="outline">via {match.job.source}</Badge>}
            {match.job.posted_at && <Badge tone="outline">{match.job.posted_at}</Badge>}
            {match.job.application_status && <Badge tone="success">{match.job.application_status}</Badge>}
          </div>
          <p className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed scrollbar-thin break-anywhere">
            {match.job.description || "No description was captured for this listing."}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader eyebrow="Resume fit" title="Skills, gaps, and alignment" description={match.rationale} />
        <CardBody className="grid sm:grid-cols-3 gap-3">
          <InfoList title="Matching" tone="success" items={match.skill_matches} />
          <InfoList title="Gaps" tone="warn" items={match.skill_gaps} />
          <InfoList title="Align" tone="accent" items={match.resume_alignment} />
        </CardBody>
      </Card>
    </div>
  );
}

function InfoList({ title, tone, items }: { title: string; tone: "success" | "warn" | "accent"; items: string[] }) {
  const dot = tone === "success" ? "bg-success" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className="rounded-xl border border-border bg-bg/40 p-3 min-h-[12rem]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.length ? items.map((item) => (
          <li key={item} className="flex gap-2 text-sm">
            <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${dot}`} />
            <span className="break-anywhere">{item}</span>
          </li>
        )) : <li className="text-sm text-subtle">None listed.</li>}
      </ul>
    </div>
  );
}

function PreviousResumes({
  items,
  activeId,
  onSelect
}: {
  items: GeneratedResume[];
  activeId: number | null;
  onSelect: (item: GeneratedResume) => void;
}) {
  return (
    <Card>
      <CardHeader eyebrow="History" title="Previous resumes" />
      <CardBody className="flex gap-2 overflow-x-auto xl:block xl:space-y-2 xl:overflow-visible">
        {items.length ? items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className={`min-w-[14rem] rounded-xl border p-3 text-left transition-colors xl:w-full ${
              activeId === item.id ? "border-accent bg-accent/8" : "border-border bg-bg/40 hover:bg-muted"
            }`}
          >
            <p className="text-sm font-medium line-clamp-2">{item.position}</p>
            <p className="text-xs text-subtle truncate">{item.company}</p>
            <p className="text-[11px] text-subtle mt-2">{new Date(item.updated_at).toLocaleString()}</p>
          </button>
        )) : (
          <p className="text-sm text-subtle">No generated resumes for this job yet.</p>
        )}
      </CardBody>
    </Card>
  );
}

function statusText(item: GeneratedResume) {
  if (item.compile_status === "compiled") return "PDF compiled and ready.";
  if (item.compile_status === "missing_pdflatex") return "LaTeX saved. Install pdflatex in the backend image to compile PDFs.";
  if (item.compile_status === "failed") return "LaTeX saved, but PDF compilation failed.";
  return "LaTeX saved. Recompile to update PDF.";
}
