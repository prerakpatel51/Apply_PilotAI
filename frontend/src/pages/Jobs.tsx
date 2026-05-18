import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  Filter,
  MapPin,
  Search,
  Trash2,
  X
} from "lucide-react";
import { deleteMatch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import type { JobMatch } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";
import { ScoreRing } from "../components/ui/ScoreRing";
import { EmptyState } from "../components/ui/EmptyState";
import { Banner } from "../components/ui/Banner";
import { Skeleton } from "../components/ui/Skeleton";

type Filters = {
  q: string;
  remote: "any" | "remote" | "onsite";
  minScore: number;
  source: string;
};

const initialFilters: Filters = { q: "", remote: "any", minScore: 0, source: "any" };

export function JobsPage() {
  const { token } = useAuth();
  const { matches, activeRun, setMatches } = useWorkspace();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [error, setError] = useState("");

  const sources = useMemo(() => {
    const s = new Set<string>();
    matches.forEach((m) => m.job.source && s.add(m.job.source));
    return Array.from(s);
  }, [matches]);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = `${m.job.title} ${m.job.company} ${m.job.location}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.remote !== "any") {
        const isRemote = /remote/i.test(m.job.location || "");
        if (filters.remote === "remote" && !isRemote) return false;
        if (filters.remote === "onsite" && isRemote) return false;
      }
      if (filters.minScore && m.score < filters.minScore) return false;
      if (filters.source !== "any" && m.job.source !== filters.source) return false;
      return true;
    });
  }, [matches, filters]);

  async function remove(m: JobMatch) {
    if (!activeRun) return;
    const prev = matches;
    setMatches((items) => items.filter((x) => x.id !== m.id));
    try {
      await deleteMatch(token!, activeRun.id, m.id);
    } catch (e) {
      setMatches(prev);
      setError(e instanceof Error ? e.message : "Could not remove job.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={activeRun ? `Run #${activeRun.user_run_number ?? activeRun.id}` : "Matches"}
        title="Ranked job matches"
        description={
          activeRun
            ? `${matches.length} matches scored against your resume.`
            : "Run a search to see ranked matches."
        }
        actions={
          <Link to="/app/search" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto" variant="outline" rightIcon={<ArrowRight size={14} />}>Run a new search</Button>
          </Link>
        }
      />

      {error && <Banner tone="danger" title="Could not update">{error}</Banner>}

      <FiltersBar filters={filters} setFilters={setFilters} sources={sources} />

      {!matches.length && activeRun?.status !== "completed" ? (
        activeRun && (activeRun.status === "pending" || activeRun.status === "running") ? (
          <ResultsSkeleton />
        ) : (
          <EmptyState
            icon={<Briefcase size={20} />}
            title="No matches yet"
            description="Connect a provider, complete your profile, and upload a resume — then run your first search."
            action={
              <Link to="/app/search">
                <Button rightIcon={<ArrowRight size={14} />}>Start a search</Button>
              </Link>
            }
          />
        )
      ) : !filtered.length ? (
        <EmptyState
          icon={<Filter size={20} />}
          title="No jobs match these filters"
          description="Try lowering the minimum score or clearing search text."
          action={<Button variant="ghost" onClick={() => setFilters(initialFilters)} leftIcon={<X size={14} />}>Clear filters</Button>}
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((m) => (
            <JobCard
              key={m.id}
              match={m}
              onOpen={() => activeRun && navigate(`/app/jobs/${activeRun.id}/${m.id}`)}
              onRemove={() => remove(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FiltersBar({
  filters,
  setFilters,
  sources
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  sources: string[];
}) {
  return (
    <Card>
      <CardBody className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input
          placeholder="Search title, company, location"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          leftIcon={<Search size={15} />}
        />
        <Select
          value={filters.remote}
          onChange={(e) => setFilters({ ...filters, remote: e.target.value as Filters["remote"] })}
          aria-label="Remote"
        >
          <option value="any">Any location</option>
          <option value="remote">Remote only</option>
          <option value="onsite">Onsite / hybrid</option>
        </Select>
        <Select
          value={String(filters.minScore)}
          onChange={(e) => setFilters({ ...filters, minScore: Number(e.target.value) })}
          aria-label="Minimum match score"
        >
          <option value="0">Any score</option>
          <option value="60">Match ≥ 60</option>
          <option value="75">Match ≥ 75</option>
          <option value="85">Match ≥ 85</option>
          <option value="92">Match ≥ 92</option>
        </Select>
        <Select
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
          aria-label="Source"
        >
          <option value="any">Any source</option>
          {sources.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </Select>
      </CardBody>
    </Card>
  );
}

function JobCard({ match, onOpen, onRemove }: { match: JobMatch; onOpen: () => void; onRemove: () => void }) {
  return (
    <article
      className="group rounded-2xl border border-border bg-surface hover:shadow-elev hover:border-fg/10 transition-all"
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left p-4 sm:p-5 focus:outline-none"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <CompanyAvatar name={match.job.company} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="text-base font-semibold break-anywhere">{match.job.title}</h3>
              <Badge tone={match.is_new_to_user ? "accent" : "outline"}>
                {match.is_new_to_user ? "New" : "Seen"}
              </Badge>
            </div>
            <p className="text-sm text-subtle break-anywhere">{match.job.company}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-subtle">
              {match.job.location && (
                <span className="inline-flex items-center gap-1"><MapPin size={12} />{match.job.location}</span>
              )}
              {match.job.application_status && (
                <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} />{match.job.application_status}</span>
              )}
              {match.job.source && <span>via {match.job.source}</span>}
              {match.job.posted_at && <span>{match.job.posted_at}</span>}
            </div>
          </div>
          <div className="self-start sm:self-auto">
            <ScoreRing score={match.score} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <SkillList title="Matched" tone="success" items={match.skill_matches} />
          <SkillList title="Gaps" tone="warn" items={match.skill_gaps} />
          <SkillList title="Alignment" tone="neutral" items={match.resume_alignment} />
        </div>

        {match.rationale && (
          <p className="text-sm text-subtle mt-4 line-clamp-2">{match.rationale}</p>
        )}
      </button>

      <div className="flex flex-col items-stretch gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <a
          href={match.job.url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-accent hover:underline inline-flex min-w-0 items-center gap-1.5 font-medium break-anywhere"
        >
          Open listing <ExternalLink size={13} />
        </a>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          leftIcon={<Trash2 size={14} />}
          className="w-full sm:w-auto"
        >
          Remove
        </Button>
      </div>
    </article>
  );
}

function SkillList({
  title,
  tone,
  items
}: {
  title: string;
  tone: "success" | "warn" | "neutral";
  items: string[];
}) {
  const dot = tone === "success" ? "bg-success" : tone === "warn" ? "bg-warn" : "bg-subtle";
  return (
    <div className="rounded-xl border border-border bg-bg/40 p-3 min-h-[88px]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-1">
          {items.slice(0, 4).map((it) => (
            <li key={it} className="text-sm flex items-center gap-2 min-w-0">
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
              <span className="break-anywhere">{it}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-subtle/80 mt-2">None listed.</p>
      )}
    </div>
  );
}

function CompanyAvatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "J";
  return (
    <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center text-sm font-semibold text-fg shrink-0 border border-border">
      {initials}
    </div>
  );
}

function JobDetail({ match, onClose }: { match: JobMatch; onClose: () => void }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow={`Match ${Math.round(match.score)} / 100`}
        title={match.job.title}
        description={`${match.job.company}${match.job.location ? ` · ${match.job.location}` : ""}`}
        action={
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" leftIcon={<X size={14} />}>
            <span className="sr-only">Close</span>
          </Button>
        }
      />
      <CardBody className="space-y-5 max-h-[calc(100vh-12rem)] overflow-auto scrollbar-thin">
        <div className="flex flex-wrap gap-2">
          {match.job.source && <Badge tone="outline">via {match.job.source}</Badge>}
          {match.job.posted_at && <Badge tone="outline">{match.job.posted_at}</Badge>}
          {match.job.application_status && <Badge tone="success">{match.job.application_status}</Badge>}
        </div>

        {match.rationale && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-subtle mb-1.5">Why it ranked here</p>
            <p className="text-sm text-fg">{match.rationale}</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <SkillList title="Matched skills" tone="success" items={match.skill_matches} />
          <SkillList title="Gaps" tone="warn" items={match.skill_gaps} />
        </div>

        {match.resume_alignment.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-subtle mb-1.5">Resume alignment</p>
            <ul className="text-sm space-y-1.5">
              {match.resume_alignment.map((r) => (
                <li key={r} className="flex gap-2"><span className="text-accent">→</span><span>{r}</span></li>
              ))}
            </ul>
          </div>
        )}

        {match.job.description && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-subtle mb-1.5">Job description</p>
            <p className="text-sm text-fg whitespace-pre-wrap leading-relaxed">{match.job.description}</p>
          </div>
        )}

        <a href={match.job.url} target="_blank" rel="noreferrer">
          <Button fullWidth rightIcon={<ExternalLink size={14} />}>Open listing</Button>
        </a>
      </CardBody>
    </Card>
  );
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="h-14 w-14 rounded-full" />
            </div>
            <Skeleton className="h-16 w-full" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
