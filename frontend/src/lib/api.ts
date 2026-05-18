import type {
  AdminAnalytics,
  AdminAgentPrompt,
  AdminAuditEntry,
  AdminFailedRun,
  AdminLiveRun,
  AdminQueueStats,
  AdminSystem,
  AdminUserDetail,
  AdminUserSummary,
  GeneratedResume,
  JobMatch,
  Profile,
  ProviderCredential,
  ProviderName,
  Resume,
  ResumeExtraction,
  SearchRun,
  SeenJob,
  UsageSnapshot,
  User
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";
const PROVIDER_KEY_STORAGE = "apply_pilot_provider_api_key";
const PROVIDER_NAME_STORAGE = "apply_pilot_provider_name";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const sessionKey = getSessionProviderKey();
  if (token && sessionKey && shouldAttachProviderKey(path, init.method)) {
    headers.set("X-Provider-Api-Key", sessionKey);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = "Request failed.";
    try {
      const payload = await response.json();
      message = payload.detail ?? message;
    } catch {
      message = response.statusText || message;
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

function shouldAttachProviderKey(path: string, method?: string) {
  const verb = (method ?? "GET").toUpperCase();
  if (verb !== "POST") return false;
  return (
    path === "/search-runs" ||
    /^\/profile\/resume\/\d+\/extract$/.test(path) ||
    /^\/resume-alignments\/matches\/\d+$/.test(path)
  );
}

export function setSessionProviderKey(provider: ProviderName, apiKey: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PROVIDER_NAME_STORAGE, provider);
  window.sessionStorage.setItem(PROVIDER_KEY_STORAGE, apiKey);
}

export function clearSessionProviderKey() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(PROVIDER_NAME_STORAGE);
  window.sessionStorage.removeItem(PROVIDER_KEY_STORAGE);
}

export function getSessionProviderKey() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(PROVIDER_KEY_STORAGE) ?? "";
}

export function signup(email: string, password: string, fullName: string) {
  return request<{ access_token: string }>("/auth/signup", null, {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName || null })
  });
}

export function signin(email: string, password: string) {
  return request<{ access_token: string }>("/auth/signin", null, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export function forgotPassword(email: string) {
  return request<{ message: string; reset_url?: string | null }>("/auth/forgot-password", null, {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function resetPassword(token: string, password: string) {
  return request<{ message: string }>("/auth/reset-password", null, {
    method: "POST",
    body: JSON.stringify({ token, password })
  });
}

export function getMe(token: string) {
  return request<User>("/auth/me", token);
}

export function getProfile(token: string) {
  return request<Profile>("/profile", token);
}

export function saveProfile(token: string, profile: Profile) {
  return request<Profile>("/profile", token, {
    method: "PUT",
    body: JSON.stringify(profile)
  });
}

export function listProviders(token: string) {
  return request<ProviderCredential[]>("/providers", token);
}

export function saveProvider(
  token: string,
  payload: { provider: ProviderName; api_key: string; model?: string; base_url?: string; task_models?: Record<string, string> }
) {
  return request<ProviderCredential>("/providers", token, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteProvider(token: string, credentialId: number) {
  return request<{ message: string }>(`/providers/${credentialId}`, token, { method: "DELETE" });
}

export function uploadResume(token: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<Resume>("/profile/resume", token, { method: "POST", body: form });
}

export function listResumes(token: string) {
  return request<Resume[]>("/profile/resumes", token);
}

export function deleteResume(token: string, resumeId: number) {
  return request<{ message: string }>(`/profile/resumes/${resumeId}`, token, { method: "DELETE" });
}

export function extractResume(token: string, resumeId: number) {
  return request<ResumeExtraction>(`/profile/resume/${resumeId}/extract`, token, { method: "POST" });
}

export function getResumeExtraction(token: string, resumeId: number) {
  return request<ResumeExtraction>(`/profile/resume/${resumeId}/extract`, token);
}

export function startSearchRun(token: string) {
  return request<SearchRun>("/search-runs", token, { method: "POST" });
}

export function listSearchRuns(token: string) {
  return request<SearchRun[]>("/search-runs", token);
}

export function listSeenJobs(token: string) {
  return request<SeenJob[]>("/search-runs/seen-jobs", token);
}

export function getSearchRun(token: string, id: number) {
  return request<SearchRun>(`/search-runs/${id}`, token);
}

export function getMatches(token: string, id: number) {
  return request<JobMatch[]>(`/search-runs/${id}/matches`, token);
}

export function getMatch(token: string, runId: number, matchId: number) {
  return request<JobMatch>(`/search-runs/${runId}/matches/${matchId}`, token);
}

export function deleteMatch(token: string, runId: number, matchId: number) {
  return request<{ message: string }>(`/search-runs/${runId}/matches/${matchId}`, token, { method: "DELETE" });
}

export function listGeneratedResumes(token: string, matchId?: number) {
  const query = matchId ? `?match_id=${matchId}` : "";
  return request<GeneratedResume[]>(`/resume-alignments${query}`, token);
}

export function generateResumeForMatch(token: string, matchId: number, jobDescriptionOverride?: string) {
  const body = jobDescriptionOverride && jobDescriptionOverride.trim()
    ? JSON.stringify({ job_description_override: jobDescriptionOverride })
    : undefined;
  return request<GeneratedResume>(`/resume-alignments/matches/${matchId}`, token, {
    method: "POST",
    body,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
}

export function updateGeneratedResume(token: string, generatedId: number, latexSource: string) {
  return request<GeneratedResume>(`/resume-alignments/${generatedId}`, token, {
    method: "PUT",
    body: JSON.stringify({ latex_source: latexSource })
  });
}

export function compileGeneratedResume(token: string, generatedId: number) {
  return request<GeneratedResume>(`/resume-alignments/${generatedId}/compile`, token, { method: "POST" });
}

export function deleteGeneratedResume(token: string, generatedId: number) {
  return request<{ message: string }>(`/resume-alignments/${generatedId}`, token, { method: "DELETE" });
}

export function generatedResumeDownloadUrl(generatedId: number, kind: "tex" | "pdf") {
  return `${API_URL}/resume-alignments/${generatedId}/download/${kind}`;
}

export function deleteSearchRun(token: string, runId: number) {
  return request<{ message: string }>(`/search-runs/${runId}`, token, { method: "DELETE" });
}

export function clearSeenJobs(token: string) {
  return request<{ message: string }>("/search-runs/seen-jobs", token, { method: "DELETE" });
}

export function deleteSeenJob(token: string, seenId: number) {
  return request<{ message: string }>(`/search-runs/seen-jobs/${seenId}`, token, { method: "DELETE" });
}

export function getUsage(token: string) {
  return request<UsageSnapshot>("/usage", token);
}

export function deleteMyAccount(token: string) {
  return request<{ message: string }>("/auth/me", token, { method: "DELETE" });
}

export function adminListUsers(token: string) {
  return request<AdminUserSummary[]>("/admin/users", token);
}

export function adminCreateUser(
  token: string,
  payload: { email: string; password: string; full_name?: string | null; is_admin?: boolean }
) {
  return request<AdminUserSummary>("/admin/users", token, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function adminListAgentPrompts(token: string) {
  return request<AdminAgentPrompt[]>("/admin/agent-prompts", token);
}

export function adminUpdateAgentPrompt(
  token: string,
  agentKey: string,
  payload: { system_prompt: string; task_template: string; extra_instructions: string; is_enabled: boolean }
) {
  return request<AdminAgentPrompt>(`/admin/agent-prompts/${agentKey}`, token, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function adminResetAgentPrompt(token: string, agentKey: string) {
  return request<AdminAgentPrompt>(`/admin/agent-prompts/${agentKey}/reset`, token, { method: "POST" });
}

export function adminDeleteUser(token: string, userId: number) {
  return request<{ message: string }>(`/admin/users/${userId}`, token, { method: "DELETE" });
}

export function adminUpdateUser(
  token: string,
  userId: number,
  payload: { is_admin?: boolean; is_active?: boolean; suspended_reason?: string }
) {
  return request<AdminUserSummary>(`/admin/users/${userId}`, token, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function adminUserDetail(token: string, userId: number) {
  return request<AdminUserDetail>(`/admin/users/${userId}/detail`, token);
}

export function adminLiveRuns(token: string) {
  return request<AdminLiveRun[]>("/admin/runs/live", token);
}

export function adminKillRun(token: string, runId: number) {
  return request<{ message: string }>(`/admin/runs/${runId}/kill`, token, { method: "POST" });
}

export function adminFailedRuns(token: string) {
  return request<AdminFailedRun[]>("/admin/runs/failed", token);
}

export function adminQueueStats(token: string) {
  return request<AdminQueueStats>("/admin/queue", token);
}

export function adminAudit(token: string) {
  return request<AdminAuditEntry[]>("/admin/audit", token);
}

export function adminAnalytics(token: string) {
  return request<AdminAnalytics>("/admin/analytics", token);
}

export function adminSystem(token: string) {
  return request<AdminSystem>("/admin/system", token);
}
