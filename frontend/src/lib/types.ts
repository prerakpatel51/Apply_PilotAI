export type ProviderName = "openai" | "anthropic";

export type User = {
  id: number;
  email: string;
  full_name?: string | null;
  is_admin?: boolean;
};

export type AdminUserSummary = {
  id: number;
  email: string;
  full_name?: string | null;
  is_admin: boolean;
  is_active?: boolean;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  created_at: string;
  provider?: string | null;
  model?: string | null;
  search_runs?: number;
  extractions?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  last_active_at?: string | null;
};

export type AdminAgentPrompt = {
  agent_key: string;
  label: string;
  system_prompt: string;
  task_template: string;
  extra_instructions: string;
  is_enabled: boolean;
  updated_at?: string | null;
};

export type AdminLiveRun = {
  id: number;
  user_id: number;
  user_email: string;
  provider: string;
  status: string;
  created_at: string;
  elapsed_seconds: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  stage: string;
  queries_generated: number;
};

export type AdminFailedRun = {
  id: number;
  user_id: number;
  user_email: string;
  provider: string;
  error_message: string | null;
  fingerprint: string;
  created_at: string;
  completed_at: string | null;
  total_tokens: number;
};

export type AdminQueueStats = {
  queue_name: string;
  queued: number;
  in_progress: number;
  deferred: number;
  failed_recent: number;
  oldest_pending_age_seconds?: number | null;
};

export type AdminAuditEntry = {
  id: number;
  actor_id: number | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type AdminAnalytics = {
  funnel: Record<string, number>;
  provider_mix: Record<string, number>;
  model_mix: Record<string, number>;
  match_score_avg: number;
  match_score_buckets: Record<string, number>;
  job_sources: Record<string, number>;
  top_companies: { company: string; count: number }[];
  resume_parse_failures: number;
  search_yield: { with_results: number; no_results: number };
};

export type AdminSystem = {
  db_rows: Record<string, number>;
  storage_bytes: number;
  storage_files: number;
  queue: AdminQueueStats;
};

export type AdminUserDetail = {
  user: AdminUserSummary;
  profile: Record<string, unknown> | null;
  resumes: { id: number; file_name: string; content_type?: string | null; preview: string; created_at: string }[];
  runs: {
    id: number;
    status: string;
    provider: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
  }[];
  extractions: { id: number; resume_id: number; model: string; total_tokens: number; updated_at: string }[];
  daily_tokens: { date: string; tokens: number }[];
};

export type Profile = {
  id?: number | null;
  target_role: string;
  alternative_titles: string;
  sponsorship_status: string;
  skills_text: string;
  preferred_locations: string;
  remote_preference: boolean;
  career_level: string;
  clearance_status: string;
  notes: string;
  updated_at?: string | null;
};

export type ProviderCredential = {
  id: number;
  provider: ProviderName;
  model: string;
  base_url?: string | null;
  task_models?: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Resume = {
  id: number;
  file_name: string;
  content_type?: string | null;
  extracted_preview: string;
  created_at: string;
};

export type ExtractedExperience = {
  title?: string;
  company?: string;
  location?: string;
  start?: string;
  end?: string;
  highlights?: string[];
};

export type ExtractedEducation = {
  degree?: string;
  field?: string;
  school?: string;
  start?: string;
  end?: string;
  details?: string;
};

export type ExtractedProject = {
  name?: string;
  summary?: string;
  tech?: string[];
};

export type ExtractedProfilePayload = {
  headline?: string;
  summary?: string;
  years_experience?: string;
  skills?: string[];
  tools?: string[];
  languages?: string[];
  keywords?: string[];
  experience?: ExtractedExperience[];
  education?: ExtractedEducation[];
  projects?: ExtractedProject[];
  certifications?: string[];
  strengths?: string[];
  gaps?: string[];
};

export type ResumeExtraction = {
  id: number;
  resume_id: number;
  file_name?: string | null;
  payload: ExtractedProfilePayload;
  model: string;
  token_usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  created_at: string;
  updated_at: string;
};

export type SearchRun = {
  id: number;
  user_run_number?: number | null;
  provider: string;
  model?: string | null;
  status: "pending" | "running" | "completed" | "failed";
  keywords: {
    normalized_target_role?: string;
    position_titles?: string[];
    search_queries?: string[];
  };
  token_usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
};

export type JobMatch = {
  id: number;
  score: number;
  skill_matches: string[];
  skill_gaps: string[];
  resume_alignment: string[];
  rationale: string;
  is_new_to_user: boolean;
  job: {
    id: number;
    title: string;
    company: string;
    location: string;
    url: string;
    source: string;
    posted_at: string;
    application_status: string;
    description: string;
  };
};

export type GeneratedResume = {
  id: number;
  match_id?: number | null;
  resume_id?: number | null;
  company: string;
  position: string;
  file_base: string;
  latex_source: string;
  compile_status: "not_compiled" | "compiled" | "failed" | "missing_pdflatex" | string;
  compile_log: string;
  has_pdf: boolean;
  model: string;
  token_usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  created_at: string;
  updated_at: string;
};

export type TokenBreakdown = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type UsageEvent = {
  kind: "search_run" | "resume_extraction";
  id: number;
  label: string;
  status: string;
  provider: string | null;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  at: string;
};

export type UsageSnapshot = {
  provider: ProviderName | null;
  model: string | null;
  lifetime: TokenBreakdown;
  search_runs: TokenBreakdown;
  extractions: TokenBreakdown;
  current_run: {
    id: number;
    user_run_number?: number | null;
    status: "pending" | "running" | "completed" | "failed";
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    started_at: string;
    updated_at?: string | null;
  } | null;
  last_run_total: number;
  events: UsageEvent[];
  server_time: string;
};

export type SeenJob = {
  id: number;
  first_seen_at: string;
  last_seen_at: string;
  job: JobMatch["job"];
};
