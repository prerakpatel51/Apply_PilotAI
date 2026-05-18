from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decrypt_text
from app.db.session import SessionLocal
from app.models.db import (
    JobListing,
    JobMatch,
    ProviderCredential,
    Resume,
    SearchRun,
    UserProfile,
    UserSeenJob,
)
from app.services.agent_prompts import extra_block, get_prompt_bundle
from app.services.json_utils import dumps_json, loads_json
from app.services.prompt_injection import sanitize_untrusted_text, untrusted_block
from app.services.providers import LLMProviderConfig, make_provider


class KeywordAgent:
    agent_key = "keyword_generation"

    def __init__(self, provider: Any, db: Session) -> None:
        self.provider = provider
        self.db = db

    def run(self, profile: UserProfile, resume: Resume) -> dict[str, Any]:
        prompt = f"""
Build search terms for finding current job openings.

User target:
- Role: {profile.target_role}
- Alternative titles the candidate also considers: {profile.alternative_titles or "(none — infer your own)"}
- Career level: {profile.career_level}
- Sponsorship status: {profile.sponsorship_status}
- Security clearance: {profile.clearance_status or "none"}
- Preferred locations: {sanitize_untrusted_text(profile.preferred_locations, 2000)}
- Remote preference: {profile.remote_preference}
- Skills: {sanitize_untrusted_text(profile.skills_text, 4000)}
- Notes: {sanitize_untrusted_text(profile.notes, 4000)}

Resume excerpt:
{untrusted_block("resume_excerpt", resume.extracted_text, 10000)}

Return this JSON shape:
{{
  "normalized_target_role": "string",
  "position_titles": ["string"],
  "search_queries": ["string"],
  "must_have_keywords": ["string"],
  "nice_to_have_keywords": ["string"],
  "exclude_terms": ["string"]
}}

Title rules:
- Seed position_titles with the candidate's "Role" and every "Alternative title" they listed. Then add 3-6 synonyms
  the industry commonly uses (e.g. ML Engineer / Machine Learning Engineer / Applied Scientist / AI Engineer).
- Deduplicate case-insensitively. Keep titles short and ATS-friendly.

Query rules:
- Generate 10-18 precise search_queries. Use the position_titles as building blocks.
- For each high-priority title, include one ATS-targeted query, e.g.:
    "<title>" site:greenhouse.io
    "<title>" site:lever.co
    "<title>" site:ashbyhq.com
    "<title>" site:jobs.workday.com OR site:myworkdayjobs.com
    "<title>" site:smartrecruiters.com
    "<title>" site:linkedin.com/jobs
- Include level and location hints only when they fit the user profile (internship, graduate, early career,
  junior, entry level, mid level, senior, remote).
{extra_block(self.db, self.agent_key)}
"""
        return self.provider.generate_json(get_prompt_bundle(self.db, self.agent_key).system_prompt, prompt)


class ResumeExtractionAgent:
    agent_key = "resume_extraction"

    def __init__(self, provider: Any, db: Session) -> None:
        self.provider = provider
        self.db = db

    def run(self, resume: Resume) -> dict[str, Any]:
        prompt = f"""
You are parsing a candidate's resume into a structured profile. Use only what the resume states.
Do not invent employers, dates, schools, or skills. If a section is missing, return an empty array.

Resume text:
{untrusted_block("resume_text", resume.extracted_text, 18000)}

Return this JSON shape:
{{
  "headline": "one-line professional summary (<=140 chars)",
  "summary": "2-4 sentence overview written in third person",
  "years_experience": "string like '4 years' or '' if unclear",
  "skills": ["string"],
  "tools": ["string"],
  "languages": ["string"],
  "keywords": ["ATS-friendly keywords pulled from the resume"],
  "experience": [
    {{
      "title": "string",
      "company": "string",
      "location": "string",
      "start": "string",
      "end": "string or 'Present'",
      "highlights": ["string"]
    }}
  ],
  "education": [
    {{
      "degree": "string",
      "field": "string",
      "school": "string",
      "start": "string",
      "end": "string",
      "details": "string"
    }}
  ],
  "projects": [
    {{
      "name": "string",
      "summary": "string",
      "tech": ["string"]
    }}
  ],
  "certifications": ["string"],
  "strengths": ["concise resume strengths"],
  "gaps": ["areas that are weak or missing on the resume"]
}}

Rules:
- Use compact strings. Do not include markdown.
- Order experience and education from most recent to oldest.
- For each experience role, write 2-4 short bullet highlights summarizing impact.
- Skills, tools, and keywords should be deduplicated, single tokens or short phrases.
{extra_block(self.db, self.agent_key)}
"""
        return self.provider.generate_json(get_prompt_bundle(self.db, self.agent_key).system_prompt, prompt)


class JobSearchAgent:
    agent_key = "job_search"

    def __init__(self, provider: Any, db: Session) -> None:
        self.provider = provider
        self.db = db

    def run(self, profile: UserProfile, resume: Resume, keywords: dict[str, Any]) -> dict[str, Any]:
        prompt = f"""
Use web search to find recent, currently relevant job listings for this candidate.
Search with these generated queries and related variants:
{keywords}

Candidate:
- Target role: {profile.target_role}
- Alternative titles: {profile.alternative_titles or "(none provided)"}
- Career level: {profile.career_level}
- Preferred locations: {sanitize_untrusted_text(profile.preferred_locations, 2000)}
- Remote preference: {profile.remote_preference}
- Sponsorship status: {profile.sponsorship_status}
- Security clearance: {profile.clearance_status or "none"}
- Skills: {sanitize_untrusted_text(profile.skills_text, 4000)}

Resume excerpt:
{untrusted_block("resume_excerpt", resume.extracted_text, 8000)}

Clearance rules:
- If the candidate has no clearance, exclude listings that require an active US security clearance (Public Trust, Secret, Top Secret, TS/SCI, polyamide/polygraph variants) or "US Citizen with clearance" requirements.
- If the candidate holds clearances, prefer listings whose required clearance is at or below the candidate's highest held clearance.

Rules:
- You MUST call the web-search / grounding tool. Do not answer from memory.
- Issue AT LEAST 6 distinct grounding searches. Use the supplied search_queries first; then synthesize 2-3
  additional variants that broaden coverage (drop a `site:` filter, swap title for an alt title, drop the
  location filter, add a level keyword). Keep going until you have run at least 6 searches.
- Aggregate EVERY unique listing the tool returns across all searches. Do not pre-filter for fit, level,
  sponsorship, clearance, or location at this stage — the ranking stage handles that. Your job here is recall.
- A listing is unique by (company, title) OR by URL host+path. De-duplicate before returning.
- Strongly prefer ATS-hosted listings (boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com, *.myworkdayjobs.com,
  jobs.workday.com, jobs.smartrecruiters.com, careers.<company>.com), then LinkedIn job pages, then trusted boards
  (BuiltIn, Otta, Wellfound). DO NOT silently drop everything else — include any job posting page that has an
  apply link, even if the host isn't in the preferred list. Set `source` to the host name in that case.
- For each returned job, copy the URL exactly as the grounding tool returned it. Do not invent URLs.
- Set `source` to one of: "greenhouse", "lever", "ashby", "workday", "smartrecruiters", "company_site", "linkedin",
  or the bare host name when none of those fit.
- Prioritize listings posted or refreshed in the last 60 days when the source shows timing.
- Aim for 8-18 unique listings. Returning fewer is fine ONLY if grounding genuinely found fewer.
- If the grounding tool returned no candidates at all, return {{"jobs": []}} and add a one-line "note" field explaining
  what queries you tried.

Return this JSON shape:
{{
  "jobs": [
    {{
      "title": "string",
      "company": "string",
      "location": "string",
      "url": "https://...",
      "source": "string",
      "posted_at": "string if available",
      "application_status": "accepting|unclear|closed",
      "description": "short factual JD summary with key requirements",
      "source_excerpt": "short evidence from the page or search result"
    }}
  ]
}}
{extra_block(self.db, self.agent_key)}
"""
        return self.provider.web_search_json(get_prompt_bundle(self.db, self.agent_key).system_prompt, prompt)


class VerificationRankingAgent:
    agent_key = "ranking"

    def __init__(self, provider: Any, db: Session) -> None:
        self.provider = provider
        self.db = db

    def run(
        self,
        profile: UserProfile,
        resume: Resume,
        jobs: list[dict[str, Any]],
        seen_jobs: list[dict[str, str]],
    ) -> dict[str, Any]:
        prompt = f"""
Use web search to verify these candidate job listings, remove closed or duplicate listings,
avoid jobs that were already shown to this user, and rank the best matches.

Candidate:
- Target role: {profile.target_role}
- Career level: {profile.career_level}
- Preferred locations: {sanitize_untrusted_text(profile.preferred_locations, 2000)}
- Remote preference: {profile.remote_preference}
- Sponsorship status: {profile.sponsorship_status}
- Security clearance: {profile.clearance_status or "none"}
- Skills: {sanitize_untrusted_text(profile.skills_text, 4000)}
- Notes: {sanitize_untrusted_text(profile.notes, 4000)}

Resume excerpt:
{untrusted_block("resume_excerpt", resume.extracted_text, 10000)}

Previously shown jobs for this user:
{seen_jobs}

Collected jobs to verify:
{jobs}

Rules:
- Use web search to spot-check status when you genuinely doubt a listing is active. Do NOT verify every URL.
- KEEP listings even when status is unclear — set `application_status` to "unclear" rather than dropping them.
- The ONLY hard exclusions are: (a) clearly closed listings, (b) exact duplicate (company+title or same URL),
  (c) listings that are not job postings at all (blog posts, company about pages).
- Always include previously-seen listings when fewer than 12 fresh matches remain; mark "previously_seen": true.
- Lower the score for soft mismatches (location, level, sponsorship, clearance) — DO NOT drop them. Returning
  a low-scoring partial fit is better than returning zero.
- Score 0-100 based on role fit, career level fit, skill match, location/remote fit, sponsorship compatibility,
  security-clearance compatibility, and resume evidence.
- Clearance compatibility: if the listing requires an active US clearance and the candidate has "none", set
  the score in the 0-30 range and include the listing with a clear gap note rather than discarding.
- Return at least 8 matches when at least 8 candidates were supplied. Only return fewer when the input pool is
  smaller than 8.
- Keep resume alignment suggestions minor and truthful. Suggest emphasis, wording, and ordering changes; do not fabricate experience.

Return this JSON shape:
{{
  "matches": [
    {{
      "job": {{
        "title": "string",
        "company": "string",
        "location": "string",
        "url": "https://...",
        "source": "string",
        "posted_at": "string",
        "application_status": "accepting|unclear"
      }},
      "score": 0,
      "matched_skills": ["string"],
      "gaps": ["string"],
      "resume_alignment": ["string"],
      "rationale": "short explanation",
      "previously_seen": false
    }}
  ]
}}
{extra_block(self.db, self.agent_key)}
"""
        return self.provider.web_search_json(get_prompt_bundle(self.db, self.agent_key).system_prompt, prompt)


def run_job_search_pipeline(run_id: int, api_key: str) -> None:
    with SessionLocal() as db:
        run = db.get(SearchRun, run_id)
        if run is None:
            return

        try:
            run.status = "running"
            db.commit()
            _run_pipeline(db, run, api_key)
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
        except Exception as exc:
            db.rollback()
            run = db.get(SearchRun, run_id)
            if run is not None:
                run.status = "failed"
                run.error_message = str(exc)
                run.completed_at = datetime.now(timezone.utc)
                db.commit()


def _run_pipeline(db: Session, run: SearchRun, api_key: str) -> None:
    profile = db.scalar(select(UserProfile).where(UserProfile.user_id == run.user_id))
    if profile is None or not profile.target_role:
        raise ValueError("Complete the target role profile before searching.")

    resume = db.scalar(
        select(Resume).where(Resume.user_id == run.user_id).order_by(Resume.created_at.desc(), Resume.id.desc())
    )
    if resume is None or not resume.extracted_text:
        raise ValueError("Upload a readable resume before searching.")

    credential = _active_credential(db, run.user_id)

    keyword_provider = make_provider(_provider_config(credential, "keyword_generation", api_key))
    keywords = KeywordAgent(keyword_provider, db).run(profile, resume)
    run.keywords_json = dumps_json(keywords)
    _add_token_usage(run, keyword_provider)
    db.commit()

    search_provider = make_provider(_provider_config(credential, "job_search", api_key))
    run.model = search_provider.config.model
    search_payload = JobSearchAgent(search_provider, db).run(profile, resume, keywords)
    _add_token_usage(run, search_provider)
    db.commit()
    jobs = _as_list(search_payload.get("jobs"))
    if not jobs:
        note = str(search_payload.get("note") or "").strip()
        msg = "The search agent did not find current listings. Try broader locations or keywords."
        if note:
            msg = f"{msg} Agent note: {note[:600]}"
        raise ValueError(msg)

    seen_jobs = _seen_jobs_for_prompt(db, run.user_id)
    ranking_provider = make_provider(_provider_config(credential, "ranking", api_key))
    ranking_payload = VerificationRankingAgent(ranking_provider, db).run(profile, resume, jobs, seen_jobs)
    _add_token_usage(run, ranking_provider)
    db.commit()
    matches = _as_list(ranking_payload.get("matches"))
    if not matches:
        raise ValueError("The ranking agent did not return any active matching jobs.")

    _persist_matches(db, run, matches, jobs)


def _active_credential(db: Session, user_id: int) -> ProviderCredential:
    credential = db.scalar(
        select(ProviderCredential)
        .where(ProviderCredential.user_id == user_id, ProviderCredential.is_active.is_(True))
        .order_by(ProviderCredential.updated_at.desc(), ProviderCredential.id.desc())
    )
    if credential is None:
        raise ValueError("Add and activate an OpenAI or Anthropic provider before searching.")
    return credential


def _provider_config(credential: ProviderCredential, task: str | None = None, api_key: str | None = None) -> LLMProviderConfig:
    payload = loads_json(decrypt_text(credential.encrypted_payload), {})
    task_models = payload.get("task_models") if isinstance(payload.get("task_models"), dict) else {}
    model = credential.model
    if task:
        model = str(task_models.get(task) or credential.model)
    resolved_api_key = api_key or str(payload.get("api_key", ""))
    if not resolved_api_key:
        raise ValueError("Your provider key is not in this browser session. Re-enter it on the API provider page.")
    return LLMProviderConfig(
        provider=credential.provider,
        api_key=resolved_api_key,
        model=model,
        base_url=payload.get("base_url"),
    )


def _persist_matches(
    db: Session,
    run: SearchRun,
    matches: list[dict[str, Any]],
    discovery_jobs: list[dict[str, Any]] | None = None,
) -> None:
    existing_seen_ids = {
        row[0] for row in db.execute(select(UserSeenJob.job_id).where(UserSeenJob.user_id == run.user_id)).all()
    }

    # Index discovery output by URL and (company, title) so we can backfill
    # description / source_excerpt that the ranking step strips out.
    discovery_by_url: dict[str, dict[str, Any]] = {}
    discovery_by_ct: dict[tuple[str, str], dict[str, Any]] = {}
    for d in discovery_jobs or []:
        if not isinstance(d, dict):
            continue
        u = str(d.get("url") or "").strip().lower()
        if u:
            discovery_by_url[u] = d
        t = str(d.get("title") or "").strip().lower()
        c = str(d.get("company") or "").strip().lower()
        if t and c:
            discovery_by_ct[(c, t)] = d

    for item in matches:
        job_payload = item.get("job") if isinstance(item.get("job"), dict) else item
        if not isinstance(job_payload, dict):
            continue
        url = str(job_payload.get("url") or "").strip()
        title = str(job_payload.get("title") or "").strip()
        company = str(job_payload.get("company") or "").strip()
        if not url or not title or not company:
            continue

        discovery_match = (
            discovery_by_url.get(url.lower())
            or discovery_by_ct.get((company.lower(), title.lower()))
            or {}
        )

        fingerprint = fingerprint_job(url, title, company, str(job_payload.get("location") or ""))
        job = db.scalar(select(JobListing).where(JobListing.fingerprint == fingerprint))
        if job is None:
            job = JobListing(fingerprint=fingerprint, title=title, company=company)
            db.add(job)

        job.title = title
        job.company = company
        job.location = str(job_payload.get("location") or "")
        job.url = url
        job.source = str(job_payload.get("source") or "")
        job.posted_at = str(job_payload.get("posted_at") or "")
        job.application_status = str(job_payload.get("application_status") or "")
        description = (
            str(job_payload.get("description") or "").strip()
            or str(item.get("description") or "").strip()
            or str(discovery_match.get("description") or "").strip()
        )
        excerpt = str(discovery_match.get("source_excerpt") or "").strip()
        if excerpt and excerpt not in description:
            description = f"{description}\n\nEvidence from listing: {excerpt}".strip()
        job.description = description
        merged_raw = {"ranking": item, "discovery": discovery_match}
        job.raw_json = dumps_json(merged_raw)
        db.flush()

        previously_seen = bool(item.get("previously_seen")) or job.id in existing_seen_ids
        match = JobMatch(
            run_id=run.id,
            user_id=run.user_id,
            job_id=job.id,
            score=float(item.get("score") or 0),
            skill_matches_json=dumps_json(_as_string_list(item.get("matched_skills"))),
            skill_gaps_json=dumps_json(_as_string_list(item.get("gaps"))),
            resume_alignment_json=dumps_json(_as_string_list(item.get("resume_alignment"))),
            rationale=str(item.get("rationale") or ""),
            is_new_to_user=not previously_seen,
        )
        db.add(match)

        seen = db.scalar(
            select(UserSeenJob).where(UserSeenJob.user_id == run.user_id, UserSeenJob.job_id == job.id)
        )
        if seen is None:
            db.add(UserSeenJob(user_id=run.user_id, job_id=job.id))
        else:
            seen.last_seen_at = datetime.now(timezone.utc)

    db.commit()


def _sync_token_usage(run: SearchRun, provider: Any) -> None:
    run.prompt_tokens = int(getattr(provider, "prompt_tokens", 0) or 0)
    run.completion_tokens = int(getattr(provider, "completion_tokens", 0) or 0)
    run.total_tokens = int(getattr(provider, "total_tokens", 0) or run.prompt_tokens + run.completion_tokens)


def _add_token_usage(run: SearchRun, provider: Any) -> None:
    run.prompt_tokens = int(run.prompt_tokens or 0) + int(getattr(provider, "prompt_tokens", 0) or 0)
    run.completion_tokens = int(run.completion_tokens or 0) + int(getattr(provider, "completion_tokens", 0) or 0)
    run.total_tokens = int(run.total_tokens or 0) + int(getattr(provider, "total_tokens", 0) or 0)


def _seen_jobs_for_prompt(db: Session, user_id: int) -> list[dict[str, str]]:
    rows = db.execute(
        select(JobListing.title, JobListing.company, JobListing.url)
        .join(UserSeenJob, UserSeenJob.job_id == JobListing.id)
        .where(UserSeenJob.user_id == user_id)
        .order_by(UserSeenJob.last_seen_at.desc())
        .limit(80)
    ).all()
    return [{"title": title, "company": company, "url": url} for title, company, url in rows]


def fingerprint_job(url: str, title: str, company: str, location: str) -> str:
    normalized = normalize_url(url)
    if normalized:
        source = normalized
    else:
        source = " ".join([title, company, location]).lower().strip()
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def normalize_url(url: str) -> str:
    if not url:
        return ""
    candidate = url.strip()
    if "://" not in candidate:
        candidate = f"https://{candidate}"
    parts = urlsplit(candidate)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in {"gh_src", "src", "source"}
    ]
    return urlunsplit(
        (
            parts.scheme.lower() or "https",
            parts.netloc.lower(),
            parts.path.rstrip("/"),
            urlencode(query),
            "",
        )
    )


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _as_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def run_resume_extraction(db: Session, user_id: int, resume: Resume, api_key: str) -> tuple[dict[str, Any], Any]:
    credential = _active_credential(db, user_id)
    provider = make_provider(_provider_config(credential, "resume_extraction", api_key))
    payload = ResumeExtractionAgent(provider, db).run(resume)
    return payload, provider


def default_model_for(provider: str) -> str:
    settings = get_settings()
    if provider == "anthropic":
        return settings.default_anthropic_model
    return settings.default_openai_model
