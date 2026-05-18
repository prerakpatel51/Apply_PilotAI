import { Link } from "react-router-dom";
import {
  ArrowRight,
  Radar,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Workflow,
  Target,
  Lock,
  FileText,
  Gauge,
  ListChecks,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Columns3,
  GitCompareArrows,
  WandSparkles
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { ThemeToggle } from "../components/ui/ThemeToggle";

export function LandingPage() {
  return (
    <div className="min-h-screen grid-noise text-fg">
      <header className="sticky top-0 z-20 backdrop-blur bg-bg/70 border-b border-border/60">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-accent text-accent-fg flex items-center justify-center shadow-soft">
              <Radar size={18} />
            </div>
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">ApplyPilot</p>
              <p className="text-sm font-semibold">ApplyPilot AI</p>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-7 mx-auto text-sm text-subtle">
            <a href="#how" className="hover:text-fg">How it works</a>
            <a href="#alignment" className="hover:text-fg">Resume alignment</a>
            <a href="#scoring" className="hover:text-fg">Match scoring</a>
            <a href="#security" className="hover:text-fg">Security</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link to="/signin" className="hidden sm:block">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/signup">
              <Button size="sm" rightIcon={<ArrowRight size={14} />}>Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-12 pb-14 sm:pt-20 sm:pb-16 lg:pt-28 lg:pb-24">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-14 items-center">
          <div className="space-y-5 sm:space-y-7 animate-fade-in">
            <Badge tone="outline" className="px-3 py-1">
              <Sparkles size={12} />
              Bring your own LLM key
            </Badge>
            <h1 className="text-4xl sm:text-display-xl font-semibold break-anywhere">
              A ranked shortlist of <span className="text-accent">jobs your resume can actually win.</span>
            </h1>
            <p className="text-base sm:text-lg text-subtle max-w-xl break-anywhere">
              ApplyPilot AI runs an agent workflow against live job listings using your own
              OpenAI or Anthropic key, ranks each role against your text or LaTeX resume, and
              generates job-specific LaTeX resumes you can edit, compile, and reuse.
            </p>
            <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              <Link to="/signup" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto" size="lg" rightIcon={<ArrowRight size={16} />}>Get started</Button>
              </Link>
              <a href="#how" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto" size="lg" variant="outline">See how it works</Button>
              </a>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-subtle pt-2">
              <li className="flex items-center gap-2"><ShieldCheck size={15} className="text-success" /> Your key, your runs</li>
              <li className="flex items-center gap-2"><Gauge size={15} className="text-success" /> Live listings, verified active</li>
              <li className="flex items-center gap-2"><FileText size={15} className="text-success" /> Text and LaTeX resumes</li>
            </ul>
          </div>

          {/* Workspace preview */}
          <PreviewCard />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-16 lg:py-24">
        <SectionHeader
          eyebrow="How it works"
          title="Five focused agent stages."
          description="No dashboards full of dials. The workflow runs end-to-end and shows you what it found, why it ranked each job, and how to tailor a LaTeX resume for that role."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-10">
          {stages.map((s, i) => (
            <div
              key={s.title}
              className="rounded-2xl border border-border bg-surface p-5 hover:shadow-elev transition-shadow"
            >
              <div className="h-9 w-9 rounded-lg bg-accent/12 text-accent flex items-center justify-center mb-4">
                <s.icon size={17} />
              </div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-subtle">Stage {i + 1}</p>
              <h3 className="text-sm font-semibold mt-1">{s.title}</h3>
              <p className="text-sm text-subtle mt-2 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Resume alignment */}
      <section id="alignment" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-16 lg:py-20">
        <div className="grid lg:grid-cols-[0.82fr_1.18fr] gap-8 lg:gap-12 items-center">
          <div>
            <SectionHeader
              eyebrow="Resume alignment"
              title="Turn a strong fit into a role-specific resume."
              description="The homepage now shows how the product converts job requirements into resume edits: preserve truthful evidence, surface missing signals, and generate a tailored LaTeX version."
              align="left"
            />
            <div className="mt-8 grid gap-3 text-sm">
              {[
                ["Find overlap", "Maps the job description against your resume sections and extracted profile."],
                ["Expose weak spots", "Separates matched proof from missing keywords, tools, and seniority signals."],
                ["Draft targeted edits", "Produces a focused resume version without turning every application into a rewrite."]
              ].map(([title, body]) => (
                <div key={title} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
                  <CheckCircle2 className="mt-0.5 text-success shrink-0" size={17} />
                  <div>
                    <p className="font-medium">{title}</p>
                    <p className="text-subtle mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <ResumeAlignmentVisualization />
        </div>
      </section>

      {/* Scoring */}
      <section id="scoring" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-16 lg:py-20">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div>
            <SectionHeader
              eyebrow="Match scoring"
              title="See exactly why a job is ranked where it is."
              description="Every match gets a fit score from 0 to 100, plus matched skills, gaps, and concrete resume alignment suggestions."
              align="left"
            />
            <ul className="space-y-3 mt-8 text-sm">
              {[
                ["Skill alignment", "Hard and soft skills from the resume vs. the JD."],
                ["Seniority + sponsorship", "Career level and visa filters built into ranking."],
                ["Recency + status", "Listings verified active before they ever rank."],
                ["Gap analysis", "What's missing on your resume to be a stronger fit."],
                ["Resume alignment", "Generate a job-specific LaTeX resume and keep prior versions in your library."]
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-accent shrink-0" />
                  <div>
                    <p className="font-medium">{t}</p>
                    <p className="text-subtle">{d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <ScoreCardPreview />
        </div>
      </section>

      {/* Security */}
      <section id="security" className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 sm:py-16 lg:py-24">
        <div className="rounded-3xl border border-border bg-surface p-5 sm:p-8 lg:p-12 grid lg:grid-cols-[1fr_1.4fr] gap-6 sm:gap-8 lg:gap-14 items-center">
          <div>
            <Badge tone="accent"><Lock size={11} /> Your key, your runs</Badge>
            <h2 className="text-2xl sm:text-display-md font-semibold mt-3">
              You bring the model. We do not store your provider key in Postgres.
            </h2>
          </div>
          <ul className="grid sm:grid-cols-2 gap-5 text-sm">
            {[
              ["Session-only key", "Your active key stays in browser session storage and is sent only for model actions."],
              ["No shared pool", "Every agent run uses your key against your provider. Token usage is yours."],
              ["Database-minimized", "Postgres stores provider and model settings, not the secret API key."],
              ["Open providers", "Works with current OpenAI GPT models and Anthropic today."]
            ].map(([t, d]) => (
              <li key={t} className="rounded-xl border border-border bg-bg/40 p-4">
                <p className="text-sm font-semibold">{t}</p>
                <p className="text-sm text-subtle mt-1">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
        <div className="rounded-3xl bg-fg text-bg p-6 sm:p-10 lg:p-14 flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-10">
          <div className="flex-1">
            <h2 className="text-2xl sm:text-display-md font-semibold">Ready to find roles that fit?</h2>
            <p className="text-subtle mt-2 max-w-xl">Set up your provider, upload a text or LaTeX resume, and start your first agent run in under five minutes.</p>
          </div>
          <Link to="/signup" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto" size="lg" variant="secondary" rightIcon={<ArrowRight size={16} />}>
              Get started
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border bg-bg">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 min-h-16 py-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs text-subtle">
          <span>© ApplyPilot AI</span>
          <span>Bring your own model. Built for serious applicants.</span>
        </div>
      </footer>
    </div>
  );
}

const stages = [
  { icon: Target, title: "Generate role queries", body: "Expands your target role into position titles and search queries." },
  { icon: Workflow, title: "Search live listings", body: "Uses provider web search to pull recent, real postings." },
  { icon: ShieldCheck, title: "Verify active", body: "Confirms each listing is open and accepting applications." },
  { icon: FileText, title: "Compare to resume", body: "Maps each JD against your text or LaTeX resume — skills, tools, gaps." },
  { icon: ListChecks, title: "Align resume", body: "Generates a role-specific LaTeX resume and stores every version." }
];

function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center"
}: {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "text-center max-w-2xl mx-auto" : "max-w-xl"}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-accent font-semibold">{eyebrow}</p>
      <h2 className="text-2xl sm:text-display-md font-semibold mt-2 break-anywhere">{title}</h2>
      {description && <p className="text-subtle mt-3 break-anywhere">{description}</p>}
    </div>
  );
}

function PreviewCard() {
  return (
    <div className="relative animate-fade-in">
      <div className="absolute -inset-6 bg-gradient-to-br from-accent/15 to-transparent blur-2xl rounded-3xl" aria-hidden />
      <div className="relative rounded-3xl border border-border bg-surface shadow-pop overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-10 border-b border-border bg-bg/40">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <span className="ml-3 text-xs text-subtle">applypilot.ai / app / search</span>
        </div>
        <div className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Agent run</p>
              <p className="text-sm font-semibold">Searching live listings</p>
            </div>
            <Badge tone="accent" className="gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse-soft" />
              Running
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["ml engineer", "ml platform", "applied scientist", "ranking infra"].map((q) => (
              <span key={q} className="text-xs px-2 py-1 rounded-full bg-muted text-fg/80 border border-border">
                {q}
              </span>
            ))}
          </div>
          <div className="space-y-3">
            {[
              ["Staff ML Engineer", "Anthropic", 92, "Remote · US"],
              ["ML Platform Engineer", "Stripe", 88, "NYC, Hybrid"],
              ["Applied Scientist II", "Amazon", 81, "Seattle"]
            ].map(([t, c, s, l]) => (
              <div key={t as string} className="flex items-center gap-3 rounded-xl border border-border bg-bg/30 p-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center text-xs font-semibold">
                  {(c as string).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t}</p>
                  <p className="text-xs text-subtle truncate">{c} · {l}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{s}</p>
                  <p className="text-[10px] uppercase tracking-wider text-subtle">match</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreCardPreview() {
  return (
    <div className="rounded-3xl border border-border bg-surface shadow-elev p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Top match</p>
          <h3 className="text-lg font-semibold mt-1">Staff ML Engineer</h3>
          <p className="text-sm text-subtle">Anthropic · Remote, US</p>
        </div>
        <div
          className="score-ring rounded-full h-16 w-16 flex items-center justify-center"
          style={{ ["--pct" as string]: 92 }}
        >
          <div className="h-[52px] w-[52px] rounded-full bg-surface flex items-center justify-center">
            <span className="text-base font-semibold tabular-nums">92</span>
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mt-5 text-sm">
        <div>
          <p className="text-xs text-subtle mb-2">Matched skills</p>
          <ul className="space-y-1">
            {["PyTorch", "Distributed training", "Eval pipelines"].map((s) => (
              <li key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-success" />{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs text-subtle mb-2">Gaps</p>
          <ul className="space-y-1">
            {["RLHF tooling", "Triton kernels"].map((s) => (
              <li key={s} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-warn" />{s}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-5 rounded-xl bg-muted/60 p-3 text-sm text-subtle border border-border">
        <Briefcase size={14} className="inline mr-2 -mt-0.5 text-accent" />
        Strong fit on infrastructure and evals. Add one RLHF project to lift score to ~96.
      </div>
    </div>
  );
}

function ResumeAlignmentVisualization() {
  const coverage = [
    ["Model evaluation", 96, "Matched"],
    ["Python + PyTorch", 91, "Matched"],
    ["Distributed systems", 84, "Needs emphasis"],
    ["RLHF workflows", 58, "Gap"]
  ];

  return (
    <div className="rounded-3xl border border-border bg-surface shadow-elev p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">Alignment preview</p>
          <h3 className="text-lg font-semibold mt-1">Resume vs. Staff ML Engineer</h3>
        </div>
        <Badge tone="accent" className="w-fit">
          <GitCompareArrows size={12} />
          86% aligned
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr] items-stretch">
        <SignalPanel
          icon={<ClipboardCheck size={16} />}
          title="Job signals"
          items={["Eval pipelines", "PyTorch", "Distributed training", "RLHF"]}
        />
        <div className="hidden lg:flex w-10 items-center justify-center">
          <div className="h-px w-full bg-border" />
        </div>
        <SignalPanel
          icon={<FileText size={16} />}
          title="Resume evidence"
          items={["A/B eval platform", "Model serving", "Kubernetes", "Ranking metrics"]}
        />
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-bg/45 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Columns3 size={15} className="text-accent" />
          Coverage matrix
        </div>
        <div className="mt-4 space-y-3">
          {coverage.map(([label, value, status]) => (
            <div key={label as string} className="grid gap-1.5 sm:grid-cols-[9.5rem_1fr_6.5rem] sm:items-center">
              <span className="text-sm font-medium truncate">{label}</span>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${(value as number) >= 80 ? "bg-success" : (value as number) >= 65 ? "bg-warn" : "bg-danger"}`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <span className="text-xs text-subtle sm:text-right">{status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-bg/45 p-4">
          <p className="text-xs text-subtle">Suggested insertion</p>
          <p className="text-sm font-medium mt-2">
            Add one bullet connecting evaluation pipelines to distributed model training impact.
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-accent/10 p-4">
          <p className="text-xs text-subtle">Generated output</p>
          <p className="text-sm font-medium mt-2 flex items-center gap-2">
            <WandSparkles size={15} className="text-accent shrink-0" />
            Targeted LaTeX resume draft
          </p>
        </div>
      </div>
    </div>
  );
}

function SignalPanel({
  icon,
  title,
  items
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg/45 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="h-8 w-8 rounded-lg bg-accent/12 text-accent flex items-center justify-center">{icon}</span>
        {title}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-fg/85">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
