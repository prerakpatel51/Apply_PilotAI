import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Save, UserRound } from "lucide-react";
import { saveProfile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import type { Profile } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Stepper } from "../components/ui/Progress";
import { Banner } from "../components/ui/Banner";
import { Badge } from "../components/ui/Badge";
import { TagInput } from "../components/ui/TagInput";
import { CheckChipGroup } from "../components/ui/CheckChipGroup";
import { ExtractedProfileCard } from "../components/ExtractedProfileCard";

const steps = [
  { key: "role", label: "Target role" },
  { key: "logistics", label: "Logistics" },
  { key: "skills", label: "Skills & locations" },
  { key: "notes", label: "Notes" },
  { key: "review", label: "Review" }
];

const careerLevelOptions = [
  { value: "internship", label: "Internship" },
  { value: "entry level", label: "Entry level" },
  { value: "graduate", label: "Graduate" },
  { value: "junior", label: "Junior" },
  { value: "mid level", label: "Mid level" },
  { value: "senior", label: "Senior" }
];

const clearanceOptions = [
  { value: "none", label: "No clearance", description: "I don't hold an active US security clearance." },
  { value: "public trust", label: "Public Trust", description: "Active Public Trust suitability." },
  { value: "confidential", label: "Confidential", description: "Active DoD Confidential." },
  { value: "secret", label: "Secret", description: "Active DoD Secret." },
  { value: "top secret", label: "Top Secret", description: "Active TS." },
  { value: "ts/sci", label: "TS/SCI", description: "Top Secret with SCI access (poly optional)." }
];

const sponsorshipOptions = [
  { value: "does not require sponsorship", label: "No sponsorship needed", description: "I'm authorized to work without visa support." },
  { value: "requires sponsorship", label: "Need sponsorship now", description: "I need an employer to sponsor my work visa." },
  { value: "future sponsorship may be needed", label: "May need later", description: "Authorized now, may need sponsorship in the future." }
];

function listFromString(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function stringFromList(items: string[]): string {
  return items.join(", ");
}

export function ProfilePage() {
  const { token } = useAuth();
  const { profile, setProfile } = useWorkspace();
  const [draft, setDraft] = useState<Profile>(profile);
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const careerLevels = listFromString(draft.career_level);
  const skills = listFromString(draft.skills_text);
  const locations = listFromString(draft.preferred_locations);
  const altTitles = listFromString(draft.alternative_titles);
  const sponsorship = draft.sponsorship_status ? [draft.sponsorship_status] : [];
  const clearances = listFromString(draft.clearance_status);

  function update<K extends keyof Profile>(key: K, value: Profile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(draft.target_role.trim());
    if (step === 2) return skills.length > 0;
    return true;
  }, [draft, step, skills.length]);

  async function persist(e?: FormEvent) {
    e?.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const saved = await saveProfile(token!, draft);
      setProfile(saved);
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        eyebrow="Step 2"
        title="Tell us what you're looking for"
        description="A quick five-step profile so the agent can match jobs that actually fit."
      />

      <Card>
        <CardHeader
          eyebrow={`Step ${step + 1} of ${steps.length}`}
          title={steps[step].label}
          icon={<UserRound size={18} />}
        />
        <CardBody className="space-y-6">
          <Stepper steps={steps} current={step} />

          {message && <Banner tone="success">{message}</Banner>}
          {error && <Banner tone="danger" title="Could not save">{error}</Banner>}

          <form onSubmit={persist} className="space-y-5">
            {step === 0 && (
              <div className="space-y-5">
                <Field label="Target role" required hint="Be specific: e.g. ‘ML Engineer’ rather than ‘Engineer’.">
                  <Input
                    value={draft.target_role}
                    onChange={(e) => update("target_role", e.target.value)}
                    placeholder="Machine Learning Engineer"
                    autoFocus
                    required
                  />
                </Field>
                <Field
                  label="Alternative titles"
                  hint="Synonyms the agent should also search for. Type a title and hit comma or Enter. Example: AI Engineer, Applied Scientist, ML Platform Engineer."
                >
                  <TagInput
                    value={altTitles}
                    onChange={(next) => update("alternative_titles", stringFromList(next))}
                    placeholder="Applied Scientist, AI Engineer, ML Platform Engineer…"
                  />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-6">
                <Field label="Career level" hint="Tick every level you're open to.">
                  <CheckChipGroup
                    options={careerLevelOptions}
                    value={careerLevels}
                    onChange={(next) => update("career_level", stringFromList(next))}
                    multiple
                    ariaLabel="Career level"
                  />
                </Field>
                <Field label="Sponsorship">
                  <CheckChipGroup
                    options={sponsorshipOptions}
                    value={sponsorship}
                    onChange={(next) => update("sponsorship_status", next[0] ?? "")}
                    multiple={false}
                    className="grid-cols-1 sm:grid-cols-3"
                    ariaLabel="Sponsorship"
                  />
                </Field>
                <Field
                  label="Security clearance"
                  hint="Tick every clearance you currently hold. Pick ‘No clearance’ if none. The agent excludes cleared-only roles when you have none."
                >
                  <CheckChipGroup
                    options={clearanceOptions}
                    value={clearances}
                    onChange={(next) => {
                      // "none" is exclusive
                      let resolved = next;
                      const hasNone = next.includes("none");
                      const hadNone = clearances.includes("none");
                      if (hasNone && !hadNone) resolved = ["none"];
                      else if (hasNone && next.length > 1) resolved = next.filter((v) => v !== "none");
                      update("clearance_status", stringFromList(resolved));
                    }}
                    multiple
                    ariaLabel="Security clearance"
                  />
                </Field>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <Field
                  label="Core skills"
                  required
                  hint="Type a skill and hit comma or Enter. Backspace removes the last chip."
                >
                  <TagInput
                    value={skills}
                    onChange={(next) => update("skills_text", stringFromList(next))}
                    placeholder="Python, PyTorch, SQL, AWS…"
                  />
                </Field>
                <Field label="Preferred locations" hint="Add one per chip. ‘Remote US’ works too.">
                  <TagInput
                    value={locations}
                    onChange={(next) => update("preferred_locations", stringFromList(next))}
                    placeholder="New York, Boston, Remote US…"
                  />
                </Field>
                <label className="flex items-center gap-3 rounded-xl border border-border bg-bg/40 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-accent"
                    checked={draft.remote_preference}
                    onChange={(e) => update("remote_preference", e.target.checked)}
                  />
                  <div className="text-sm">
                    <p className="font-medium">Open to remote roles</p>
                    <p className="text-subtle text-xs">We'll still surface hybrid and onsite roles in your preferred cities.</p>
                  </div>
                </label>
              </div>
            )}

            {step === 3 && (
              <Field label="Notes" hint="Industries you prefer, companies to avoid, schedule constraints — anything the agent should weigh.">
                <Textarea
                  value={draft.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  rows={5}
                  placeholder="Prefer healthcare or fintech. Avoid defense. Cannot relocate before June."
                />
              </Field>
            )}

            {step === 4 && (
              <div className="space-y-3 text-sm">
                <ReviewRow label="Target role" value={draft.target_role || "—"} />
                <ReviewChipRow label="Alternative titles" items={altTitles} />
                <ReviewChipRow label="Career level" items={careerLevels} />
                <ReviewRow label="Sponsorship" value={sponsorshipOptions.find((o) => o.value === draft.sponsorship_status)?.label || "—"} />
                <ReviewChipRow
                  label="Clearance"
                  items={clearances.map((c) => clearanceOptions.find((o) => o.value === c)?.label || c)}
                />
                <ReviewChipRow label="Skills" items={skills} />
                <ReviewChipRow label="Locations" items={locations} />
                <ReviewRow label="Remote" value={draft.remote_preference ? "Yes" : "No"} />
                <ReviewRow label="Notes" value={draft.notes || "—"} />
              </div>
            )}

            <div className="flex flex-col gap-3 -mx-4 px-4 pt-5 mt-2 border-t border-border sm:-mx-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <Button
                className="w-full sm:w-auto"
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                leftIcon={<ArrowLeft size={14} />}
              >
                Back
              </Button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {step < steps.length - 1 ? (
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                    disabled={!stepValid}
                    rightIcon={<ArrowRight size={14} />}
                  >
                    Next
                  </Button>
                ) : (
                  <>
                    <Button className="w-full sm:w-auto" type="submit" loading={saving} leftIcon={<Save size={16} />}>
                      Save profile
                    </Button>
                    <Link to="/app/resume" className="w-full sm:w-auto">
                      <Button className="w-full sm:w-auto" variant="ghost" rightIcon={<ArrowRight size={14} />} disabled={saving}>
                        Continue to resume
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </form>
        </CardBody>
      </Card>

      <ExtractedProfileCard />
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2.5 border-b border-border last:border-0">
      <p className="text-subtle text-xs uppercase tracking-wide sm:w-40 sm:shrink-0 mb-1 sm:mb-0">{label}</p>
      <p className="text-fg whitespace-pre-wrap break-words min-w-0 flex-1">{value}</p>
    </div>
  );
}

function ReviewChipRow({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4 py-2.5 border-b border-border last:border-0">
      <p className="text-subtle text-xs uppercase tracking-wide sm:w-40 sm:shrink-0 mb-1 sm:mb-0">{label}</p>
      <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
        {items.length ? (
          items.map((s) => (
            <Badge key={s} tone="outline" className="max-w-full">
              <span className="truncate">{s}</span>
            </Badge>
          ))
        ) : (
          <span className="text-fg">—</span>
        )}
      </div>
    </div>
  );
}
