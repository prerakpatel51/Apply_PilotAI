# ApplyPilot AI — Frontend Design Handoff

Premium, calm, workflow-first product. Apple/Linear discipline. No marketing fluff.

---

## 1. Stack

- React 19, Vite, TypeScript
- Tailwind 3 (CSS-vars for theming) + `class`-strategy dark mode (system-aware bootstrap in `index.html`)
- `react-router-dom` v7 for routes
- `lucide-react` icons
- `clsx` for class composition

Run:

```bash
cd frontend
npm install
npm run dev
```

---

## 2. Design tokens

Defined as CSS variables in `src/styles/app.css` and surfaced to Tailwind via `tailwind.config.js`.

| Token | Light | Dark | Use |
|------|-------|------|-----|
| `bg` | `250 250 251` | `9 9 12` | App background |
| `surface` | `255 255 255` | `17 17 22` | Cards, inputs, sheets |
| `elev` | `255 255 255` | `24 24 30` | Elevated surfaces |
| `border` | `229 231 235` | `39 39 47` | All hairlines |
| `muted` | `243 244 246` | `30 30 37` | Chips, soft fills |
| `fg` | `17 24 39` | `244 244 247` | Primary text |
| `subtle` | `107 114 128` | `161 161 170` | Secondary text |
| `accent` | `79 70 229` (indigo-600) | `129 140 248` (indigo-400) | Primary brand + actions |
| `ring` | indigo-500 | indigo-400 | Focus ring at 28% alpha |
| `success` | emerald-600 | emerald-400 | Positive states |
| `warn` | amber-600 | amber-500 | Caution / gaps |
| `danger` | red-600 | red-400 | Destructive / errors |

**Type:** Inter (variable, served from `rsms.me/inter`). Display sizes use `clamp()` for fluid type. Body 14–16 px.

**Radius:** 12 (controls), 16 (cards), 20 (sheets), 24 (hero containers).

**Shadow:** `shadow-soft` for resting cards, `shadow-elev` for hovered, `shadow-pop` for portals, `shadow-ring` for focus emphasis.

**Motion:** 150 ms (controls), 320 ms `fade-in` (page mount), `pulse-soft` for live indicators, `agent-pulse` for the running-agent dot, `shimmer` for skeletons. All ease-out.

---

## 3. Information architecture

```
/                              Landing (public)
/signin                        Sign in
/signup                        Sign up
/app                           Protected shell (sidebar + topbar)
  /app/search                  Agent run workspace (default)
  /app/jobs                    Ranked matches + filters + detail
  /app/history                 Previous jobs + run history
  /app/provider                Provider / API key
  /app/profile                 Candidate profile wizard + extracted profile
  /app/resume                  Resume upload + preview
```

Auth context (`src/lib/auth.tsx`) gates `/app/*`. Workspace context (`src/lib/workspace.tsx`) loads profile/providers/resumes/runs once after login and exposes setters + `useReadiness()` for the search gate.

---

## 4. Page-by-page

### Landing (`pages/Landing.tsx`)

- Hero: eyebrow ("Bring your own LLM key") + display headline + supporting line + dual CTAs ("Get started" / "See how it works") + 3 trust strip items.
- Animated workspace preview on the right (browser chrome → running agent badge → query chips → 3 job rows with scores).
- "How it works" 5-card row mapping the agent stages.
- "Match scoring" split — copy + ScoreCardPreview component (live score-ring + matched / gaps / rationale).
- "Security" panel: 4 cards on encryption / no proxy / revoke / providers.
- Inverted CTA strip near footer.
- Sticky transparent header with anchor nav and theme toggle.

### Auth (`SignIn`, `SignUp`)

- Split-screen on `lg+`: brand panel left (dark, ambient gradient), form right.
- Inputs have inline lucide icons; sign-up reaches `/app/provider` after success (start of guided setup); sign-in reaches `/app/search`.
- Remember-me on sign-in toggles `localStorage` vs `sessionStorage` (preserves existing behavior).
- Errors render as `Banner tone="danger"` with title + body.

### Provider (`pages/Provider.tsx`)

- 3 selectable provider tiles (OpenAI / Anthropic / Bedrock) with one-line blurb + "Saved" tag if a key is on file.
- Single form: masked API key (lock icon), Model select with "Recommended" pre-selected, "Custom model ID" escape hatch, Bedrock-only base URL.
- "Remove key" lives next to the saved-state notice with confirm-on-click pattern.
- Footer trust line "We never proxy your key" + secondary CTA to `/app/profile` once a key is active.

### Profile wizard (`pages/Profile.tsx`)

- 5-step `Stepper`: Target role → Logistics → Skills & locations → Notes → Review.
- Per-step validation (`stepValid`) blocks Next until required fields are filled.
- Review step renders read-only rows; Save persists, then "Continue to resume".
- Below the wizard: "Extracted candidate profile" card — currently shows the resume preview text. Wire structured extraction here once the backend returns it.

### Resume (`pages/Resume.tsx`)

- Drag-and-drop card with keyboard activation, dashed border that lights up on dragover, inline spinner during upload.
- Accepted-format chips (PDF / LaTeX / Plain text) + helper line.
- Latest upload renders as a mono-font preview in a scrollable container; CTA to `/app/search`.

### Search workspace (`pages/Search.tsx`)

- Two-column grid: **Readiness** card (3 rows: provider, profile, resume — each with inline "Connect/Complete/Upload" CTA if missing) and **Live progress** card (animated stage list + Progress bar + tokens counter).
- "Search jobs" primary action disabled until all three readiness rows pass. Polls run status every 2.5 s while pending/running.
- When the run has produced `search_queries`, a Generated queries panel renders chips below.
- On completion: CTA "View ranked matches" jumps to `/app/jobs`.

### Jobs (`pages/Jobs.tsx`)

- Filters bar (search input, remote select, min-score select, source select).
- Job cards: company avatar, title, "New/Seen" badge, location/source/status row, 3-column skill grid (matched/gaps/alignment), rationale teaser, score ring on the right.
- Hover row → focusable; clicking the card opens the detail panel on the right (sticky on `xl+`). Card actions: Open listing (external), Remove (optimistic delete + rollback on failure).
- Detail panel: badges (source, posted, status), Why-it-ranked rationale, matched/gaps grid, resume alignment list, full JD, primary "Open listing" CTA.

### History (`pages/History.tsx`)

- Left: Previous jobs grouped Today / Yesterday / dated. 2-column compact cards with company avatar, title, company + last-seen time, external-link icon.
- Right: Recent run history. Click to set `activeRun` and rehydrate matches from `getMatches`.

---

## 5. Component hierarchy

```
src/
  components/
    AppLayout.tsx          sidebar + topbar + mobile bottom tab
    PageHeader.tsx
    ui/
      Button.tsx           primary | secondary | outline | ghost | danger, sm/md/lg, loading
      Card.tsx             Card | CardHeader (eyebrow/title/desc/icon/action) | CardBody | CardFooter
      Input.tsx            Input (leftIcon), Textarea, Select (custom chevron), Field (label/hint/error)
      Badge.tsx            neutral | accent | success | warn | danger | outline
      Banner.tsx           info | success | warn | danger — alert role for danger/warn
      Progress.tsx         linear bar + Stepper
      Skeleton.tsx         shimmer fills
      Tabs.tsx             SegmentedTabs (pill-style segmented control)
      EmptyState.tsx
      ScoreRing.tsx        conic-gradient ring around centered numeric score
      ThemeToggle.tsx
  lib/
    api.ts                 unchanged contract
    types.ts               unchanged
    auth.tsx               AuthProvider / useAuth
    workspace.tsx          WorkspaceProvider / useWorkspace / useReadiness / blankProfile
    cn.ts                  clsx wrapper
  pages/
    Landing, SignIn, SignUp, Provider, Profile, Resume, Search, Jobs, History
```

---

## 6. Copy guide

| Surface | Copy |
|---------|------|
| Hero headline | "A ranked shortlist of jobs your resume can actually win." |
| Hero sub | "ApplyPilot AI runs an agent workflow against live job listings using your own OpenAI, Anthropic, or Bedrock key — then ranks each role against your resume with a clear fit score and gap analysis." |
| Primary CTA | "Get started" |
| Secondary CTA | "See how it works" |
| Sign in title | "Welcome back" / sub: "Sign in to continue your job search." |
| Sign up title | "Create your account" / sub: "Set up your provider next — it takes about a minute." |
| Provider page | "Connect your model provider — Your key is encrypted and only used for your own agent runs. You can remove it at any time." |
| Trust line | "We never proxy your key." |
| Profile step 0 hint | "Be specific: e.g. 'ML Engineer' rather than 'Engineer'." |
| Resume drop area | "Drag your resume here, or click to choose — PDF, LaTeX (.tex), or plain text. Max 5 MB." |
| Search CTA enabled | "Search jobs" |
| Search CTA running | "Agent running…" |
| Stage 1 | "Generate role queries — Expanding position titles and search queries." |
| Stage 2 | "Search live listings — Pulling recent postings from the open web." |
| Stage 3 | "Verify active — Checking each posting is still accepting applications." |
| Stage 4 | "Compare to resume — Mapping JDs against skills, tools, and experience." |
| Stage 5 | "Rank fit — Scoring matches and writing rationales." |
| Empty: no matches | "No matches yet — Connect a provider, complete your profile, and upload a resume — then run your first search." |
| Empty: filters strip out everything | "No jobs match these filters — Try lowering the minimum score or clearing search text." |
| Empty: history | "No history yet — Jobs surfaced by searches will appear here grouped by date." |
| Error: search fail | Banner danger, title "Search error", body = API message |
| Error: invalid key | Banner danger, title "Provider error" (surfaced via API message) |
| Confirmation: remove key | "Remove key" → on success "API key removed." |
| Confirmation: remove job | Inline optimistic; rollback Banner on failure: "Could not update" |

Voice: short, direct, second person. Verbs in CTAs. No exclamation points. No "Awesome!".

---

## 7. Interaction details

- **Focus**: global `:focus-visible` ring (4 px ring at 28% accent alpha, 8 px radius) on all interactive elements.
- **Hover**: cards bump from `shadow-soft` to `shadow-elev`, border darkens by one step. Buttons drop to 90% opacity.
- **Loading**: buttons swap left icon for spinning `Loader2` when `loading`. Skeletons shimmer at 1.6 s. Live agent badges use `pulse-soft`.
- **Agent run polling**: 2.5 s interval, pauses on tab blur (browser default), stops on `completed` or `failed`.
- **Optimistic mutations**: remove-match removes the row immediately, restores on API failure with a Banner.
- **Routing**: `Protected` redirects to `/signin`; `PublicOnly` (sign-in/up) bounces authenticated users to `/app/search`.

---

## 8. Responsive behavior

- **≥ 1280 px**: 2-column results (cards + sticky detail panel).
- **1024–1279 px**: sidebar visible (256 px), single-column results, detail opens inline below (could be a Sheet — not implemented yet, see Open work).
- **640–1023 px**: sidebar hidden; mobile bottom-tab nav across 5 entries; cards become full width; readiness card stacks above progress.
- **< 640 px**: stepper compresses (numbers always visible, labels truncate); job cards stack avatar + score on top; landing hero stacks above preview.

---

## 9. Accessibility

- All interactive elements are buttons or anchors (no clickable divs).
- Form controls have labels via `<Field label htmlFor>` + `aria-label` where the label is visual-only.
- `aria-selected` on segmented controls, `role="alert"` on `Banner` for danger/warn, `aria-live="polite"` on the agent-progress region (inherits via Banner).
- Color is never the only signal: badges carry text, score ring carries the number, skill lists include tone dots **and** section titles.
- Focus order follows DOM order; sticky elements (topbar, mobile nav) sit above content but do not steal focus.
- Keyboard: dropzone activates on Enter, theme toggle is a real button, all CTAs reachable via Tab.

---

## 10. Edge states

| State | Surface |
|------|---------|
| No provider key | Sidebar dot on Provider; readiness row "Not connected" with CTA. |
| No resume | Sidebar dot on Resume; readiness row "Not uploaded" with CTA. |
| No profile | Sidebar dot on Profile; readiness row "Missing target role or skills". |
| No jobs found | EmptyState with "Start a search" CTA. |
| Search failed | Banner danger with `run.error_message`; Search button re-enabled. |
| Invalid/expired key | API error bubbles to the page-level Banner; Provider page surfaces the same. |
| Removed job | Optimistic removal; on failure, rollback + Banner. |
| Previous jobs empty | EmptyState with "Run your first search". |
| Token usage unavailable | Tokens row shows `—` instead of 0. |
| Bedrock without base URL | Field is `required`; HTML validation blocks submit. |

---

## 11. Implementation notes

- `src/lib/api.ts` is unchanged — UI uses the existing endpoints and types as-is. No backend changes required to ship this redesign.
- `WorkspaceProvider` is mounted only under `/app` so unauthenticated visitors never hit the workspace endpoints.
- Polling lives in `pages/Search.tsx`; once a run completes, matches and seen-jobs refresh in workspace state. Jobs and History pages read from that shared state directly.
- The extracted candidate profile section in `pages/Profile.tsx` currently renders the resume preview text. Wire structured extraction (skills, experience, projects, ATS keywords, strengths, gaps) into `Profile` types and a new `GET /profile/extracted` endpoint, then replace `ExtractedProfileSummary`.
- Theme persistence: `localStorage["theme"]` ("light"|"dark"). Inline script in `index.html` applies the class before paint to avoid FOUC.

---

## 12. Open work (not in this pass)

- **Sheet / Drawer** primitive for job detail on tablet (1024–1279 px) and mobile.
- **Toast** stack for non-blocking success messages (currently using inline Banners).
- **Resume version history** — backend already returns `listResumes()` as an array; UI shows only the latest.
- **Structured extracted profile** UI (above) once backend exposes it.
- **Job-detail full route** (`/app/jobs/:id`) for shareable deep links.
- **Saved searches / scheduled runs** — pure UI addition once a backend endpoint exists.
- **Visual regression tests** (Playwright + percy or storybook + chromatic) for the UI primitives.

---
