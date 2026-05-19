# ApplyPilot AI

**Live:** https://applypilotai.duckdns.org/signin

ApplyPilot AI is a full-stack job-search and resume-alignment workspace. It helps a candidate search live job postings, rank them against a master resume, inspect gaps, and generate role-specific LaTeX resumes that can be edited, compiled, downloaded, and tracked over time.

The product is built for a bring-your-own-key model: users connect their own OpenAI or Anthropic API key, and every agent run uses that user's browser-session provider key.

---

## What It Does

- Searches live job listings from a candidate profile and resume.
- Scores job matches against skills, seniority, location, sponsorship, and resume evidence.
- Shows matched skills, gaps, rationale, and resume-alignment suggestions.
- Generates one-page ATS-focused LaTeX resumes for specific jobs.
- Provides an Overleaf-style editor with PDF preview and LaTeX/PDF downloads.
- Tracks uploaded master resumes and generated aligned resumes in a resume library.
- Gives admins operational visibility, user controls, analytics, audit logs, and editable agent prompts.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, lucide-react |
| Backend API | FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL in Docker, SQLite fallback for local backend-only runs |
| Queue | Redis + ARQ worker |
| Agent Orchestration | LangGraph state graph with LangChain runnable nodes |
| LLM Providers | OpenAI Responses API, Anthropic Messages API |
| Resume Compilation | TeX Live / `pdflatex` inside the backend image |
| Auth | Email/password with JWT bearer tokens |
| Storage | Local filesystem under `backend/storage` |

---

## System Architecture

```text
                              ┌──────────────────────┐
                              │      React / Vite     │
                              │  app UI on :5173      │
                              └──────────┬───────────┘
                                         │ REST / JSON
                                         ▼
                              ┌──────────────────────┐
                              │       FastAPI         │
                              │  auth, profile, jobs  │
                              │  resumes, admin       │
                              └───────┬───────┬──────┘
                                      │       │
                                      │       │ enqueue jobs
                                      ▼       ▼
                          ┌──────────────┐  ┌──────────────┐
                          │  PostgreSQL  │  │ Redis + ARQ  │
                          │  app data    │  │ worker queue │
                          └──────────────┘  └──────┬───────┘
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │ LangGraph        │
                                          │ Agent Pipeline   │
                                          └────────┬─────────┘
                                                   │
                                                   ▼
                                          ┌──────────────────┐
                                          │ OpenAI/Anthropic │
                                          │ provider calls   │
                                          └────────┬─────────┘
                                                   │
                                                   ▼
                                      ┌─────────────────────────┐
                                      │ backend/storage          │
                                      │ resumes, generated .tex  │
                                      │ compiled .pdf            │
                                      └─────────────────────────┘
```

---

## Backend Modules

```text
backend/app
├── api/
│   ├── routes_auth.py              # signup, signin, password reset, account deletion
│   ├── routes_profile.py           # profile, resume upload, extraction
│   ├── routes_providers.py         # encrypted provider credentials and task models
│   ├── routes_search.py            # search runs, matches, seen jobs
│   ├── routes_resume_alignment.py  # generated resumes, compile, download, delete
│   ├── routes_usage.py             # token usage snapshots
│   └── routes_admin.py             # admin users, runs, prompts, analytics, system info
├── core/
│   ├── config.py                   # environment-backed settings
│   └── security.py                 # password hashing, JWT, credential encryption
├── db/
│   ├── session.py                  # SQLAlchemy engine/session
│   └── init_db.py                  # table creation and lightweight migrations
├── models/
│   └── db.py                       # ORM models
├── services/
│   ├── agents.py                   # LangGraph search pipeline plus agent implementations
│   ├── agent_prompts.py            # default/admin-editable prompts
│   ├── prompt_injection.py         # untrusted text sanitization
│   ├── providers.py                # OpenAI/Anthropic adapters
│   ├── resume_parser.py            # .txt/.text/.tex resume parsing
│   └── rate_limit.py               # Redis-backed run limits
├── queue.py                        # ARQ enqueue helpers
├── worker.py                       # ARQ worker entrypoint
└── main.py                         # FastAPI app startup
```

---

## Frontend Modules

```text
frontend/src
├── pages/
│   ├── Landing.tsx                 # public homepage
│   ├── Provider.tsx                # OpenAI/Anthropic session key + model setup
│   ├── Profile.tsx                 # candidate target role and preferences
│   ├── Resume.tsx                  # master resume upload (.tex/.txt only)
│   ├── Search.tsx                  # start and monitor search runs
│   ├── Jobs.tsx                    # ranked job matches
│   ├── JobResumeAlignment.tsx      # JD details + LaTeX editor + PDF preview
│   ├── GeneratedResumes.tsx        # uploaded/generated resume library
│   ├── Usage.tsx                   # token usage
│   └── admin/                      # admin console
├── components/
│   ├── AppLayout.tsx
│   ├── Tokenometer.tsx
│   └── ui/
├── lib/
│   ├── api.ts                      # typed API client
│   ├── auth.tsx                    # auth context
│   ├── workspace.tsx               # app data context
│   └── types.ts                    # shared TypeScript shapes
└── styles/app.css
```

The frontend is designed mobile-first:

- `AppLayout` uses a desktop sidebar and a fixed, horizontally scrollable bottom nav on phones so every section remains reachable.
- `PageHeader`, `CardHeader`, `Button`, and form controls wrap safely on narrow screens instead of pushing content off the page.
- Dense admin and usage tables stay horizontally scrollable inside their cards.
- Resume alignment switches from the Overleaf-style split editor on desktop to stacked editor/preview panels on phones.
- Primary page actions are kept near the page header or card footer and expand to full width on mobile for easier tapping.
- Long job titles, company names, model names, LaTeX file names, and prompt text use safe wrapping to avoid left/right overflow.

---

## Agent Pipeline

The job-search workflow runs as a cached LangGraph `StateGraph` in the ARQ worker. Each graph node is wrapped with LangChain's `RunnableLambda`, while the model calls still flow through the app's provider adapters so user API-key handling, provider web search, and token accounting remain consistent.

Current search graph:

```text
load_context
  -> generate_keywords
  -> search_jobs
  -> rank_jobs
  -> persist_matches
```

### 1. Resume Extraction Agent

Parses a text or LaTeX master resume into structured profile data:

- summary
- skills
- tools
- experience
- education
- projects
- certifications
- strengths and gaps

### 2. Keyword Generation Agent

Builds search titles and ATS-focused queries from:

- target role
- alternative titles
- career level
- sponsorship status
- location preferences
- candidate skills
- master resume excerpt

### 3. Job Search Agent

Uses provider web search to collect live job listings from sources such as:

- Greenhouse
- Lever
- Ashby
- Workday
- SmartRecruiters
- LinkedIn
- company career pages

### 4. Verification and Ranking Agent

Verifies and ranks jobs by:

- role fit
- skill overlap
- career level
- sponsorship compatibility
- clearance requirements
- location/remote fit
- resume evidence

It persists `JobMatch` rows with:

- fit score
- matched skills
- gaps
- resume alignment notes
- rationale

### 5. Resume Alignment Agent

Generates a one-page ATS-focused LaTeX resume for a selected job. It uses:

- master resume content
- extracted profile
- full job description
- matched skills/gaps/alignment notes
- locked LaTeX template

Generated resumes are saved as:

```text
backend/storage/generated_resumes/<user_id>/<username_company_position_match_id>/
├── username_company_position.tex
└── username_company_position.pdf
```

---

## Resume Workflow

ApplyPilot AI intentionally accepts only text-first master resumes:

- `.tex`
- `.txt`
- `.text`

PDF upload is disabled for master resumes to keep parsing deterministic and reduce extraction failures. Generated aligned resumes can still be compiled to PDF and downloaded.

Resume library features:

- view uploaded master resumes
- delete uploaded master resumes
- view generated aligned resumes
- download generated `.tex`
- download generated `.pdf`
- delete generated resumes

---

## Admin Console

Admins can access:

| Page | Purpose |
| --- | --- |
| Overview | Product and system summary |
| Users | User management, admin/suspend/delete controls |
| Runs | Live and failed search runs, kill switch |
| Prompts | Edit system prompts, full task templates, and extra instructions |
| Analytics | Funnel, provider/model mix, match quality, job sources |
| Audit | Admin action history |
| System | DB row counts, queue state, storage size |

Prompt management supports:

- system prompt edits
- full task prompt template edits
- reset to defaults
- audit logging

The resume-alignment prompt template exposes placeholders such as:

```text
{resume_content}
{extracted_profile}
{jd}
{locked_template}
```

---

## Provider and Model Setup

Supported providers:

- OpenAI
- Anthropic

OpenAI model options in the UI include:

- `gpt-5.5`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `gpt-5.2`
- `gpt-5.2-pro`
- `gpt-5.2-codex`
- `gpt-5-mini`
- `gpt-5-nano`

Anthropic model options include the configured Claude 4 family options.

Each provider can use one model everywhere or per-task model overrides:

- resume extraction
- resume alignment
- keyword generation
- live job search
- ranking and gap analysis

Provider metadata is stored in Postgres, but provider API keys are not persisted in the database. The browser keeps the active key in `sessionStorage`; synchronous model actions send it in an HTTPS request header, and queued search runs carry an encrypted per-job copy in Redis only long enough for the worker to execute the run.

---

## Security Model

The app includes several protections appropriate for a local/internal BYOK workflow:

- Password hashing with bcrypt.
- JWT bearer auth.
- User data scoped by `user_id`.
- Admin-only routes protected by `get_current_admin`.
- Provider keys are not stored in Postgres; only provider/model metadata is persisted.
- Prompt-injection sanitization for resumes, JDs, profile fields, and web-derived text.
- Untrusted content wrapped in explicit data blocks before agent calls.
- Dangerous LaTeX commands blocked before compilation.
- Search run rate limiting.
- Admin actions audited.

Prompt-injection hardening is based on OWASP guidance:

- treat resumes/JDs/web pages as untrusted data
- remove common injection phrases
- normalize invisible/control characters
- separate instructions from data
- validate model outputs before use



## Local Development

Backend:

```bash
cd backend
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:8000
```

Local backend-only runs default to SQLite unless `DATABASE_URL` is set.

---

## Docker Development

Run the full stack:

```bash
docker compose up -d --build
```

Services:

| Service | Port | Purpose |
| --- | --- | --- |
| `frontend` | `5173` | Vite React app |
| `backend` | `8000` | FastAPI app |
| `worker` | internal | ARQ search worker |
| `db` | `5432` | PostgreSQL |
| `redis` | `6379` | Queue and rate limit state |

View logs:

```bash
docker compose logs -f backend
docker compose logs -f worker
docker compose logs -f frontend
```

Rebuild after code changes:

```bash
docker compose up -d --build backend frontend worker
```

---

## Environment Variables

Important variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy database URL |
| `REDIS_URL` | Redis connection URL |
| `SECRET_KEY` | JWT signing and fallback encryption secret |
| `ENCRYPTION_SECRET` | Preferred provider-key encryption secret |
| `BACKEND_CORS_ORIGINS` | Allowed frontend origins |
| `FRONTEND_URL` | Used for password reset links |
| `ADMIN_EMAIL` | Seeded admin email |
| `SMTP_HOST` | SMTP server for password reset |
| `SMTP_PORT` | SMTP port |
| `SMTP_USERNAME` | SMTP username |
| `SMTP_PASSWORD` | SMTP password or app password |
| `SMTP_FROM_EMAIL` | From address |

For Gmail SMTP, use a Google App Password, not the normal account password.

---

## Data Model Overview

Core tables:

- `users`
- `user_profiles`
- `provider_credentials`
- `resumes`
- `resume_extractions`
- `search_runs`
- `job_listings`
- `job_matches`
- `user_seen_jobs`
- `generated_resumes`
- `agent_prompt_configs`
- `audit_logs`

---

## Common Workflows

### First User Flow

1. Sign up.
2. Connect OpenAI or Anthropic key.
3. Fill candidate profile.
4. Upload `.tex` or `.txt` master resume.
5. Extract structured resume profile.
6. Run search.
7. Open a job match.
8. Generate aligned resume.
9. Edit LaTeX.
10. Recompile and download PDF/LaTeX.

### Admin Prompt Editing

1. Sign in as admin.
2. Open `/app/admin/prompts`.
3. Select an agent.
4. Edit system prompt, task template, or extra instructions.
5. Save.
6. Future agent runs use the saved prompt.

### Resume Library

Open `/app/generated-resumes` to:

- inspect uploaded master resumes
- delete uploaded resumes
- inspect generated aligned resumes
- download LaTeX/PDF
- delete generated resumes

---

## Verification Commands

Backend compile check:

```bash
python -m compileall backend/app
```

Frontend build:

```bash
cd frontend
npm run build
```

Docker rebuild:

```bash
docker compose up -d --build backend frontend worker
```

---

## Notes

- Generated PDF support requires the backend image with TeX Live packages installed.
- Master resume upload intentionally excludes PDF.
- Existing generated PDFs remain downloadable even though PDF upload is disabled.
- Provider model availability can vary by account and organization.
- Token usage is charged by the connected user's provider account.
