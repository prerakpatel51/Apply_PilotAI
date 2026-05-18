import { createContext, Dispatch, ReactNode, SetStateAction, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import {
  getProfile,
  listProviders,
  listResumes,
  listSearchRuns,
  listSeenJobs,
  getMatches
} from "./api";
import type { JobMatch, Profile, ProviderCredential, Resume, SearchRun, SeenJob } from "./types";

export const blankProfile: Profile = {
  target_role: "",
  alternative_titles: "",
  sponsorship_status: "",
  skills_text: "",
  preferred_locations: "",
  remote_preference: true,
  career_level: "",
  clearance_status: "",
  notes: ""
};

type WorkspaceState = {
  loading: boolean;
  error: string;
  profile: Profile;
  providers: ProviderCredential[];
  resumes: Resume[];
  runs: SearchRun[];
  seenJobs: SeenJob[];
  matches: JobMatch[];
  activeRun: SearchRun | null;
  setProfile: Dispatch<SetStateAction<Profile>>;
  setProviders: Dispatch<SetStateAction<ProviderCredential[]>>;
  setResumes: Dispatch<SetStateAction<Resume[]>>;
  setRuns: Dispatch<SetStateAction<SearchRun[]>>;
  setSeenJobs: Dispatch<SetStateAction<SeenJob[]>>;
  setMatches: Dispatch<SetStateAction<JobMatch[]>>;
  setActiveRun: Dispatch<SetStateAction<SearchRun | null>>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<WorkspaceState | null>(null);

function initialWorkspaceData() {
  return {
    profile: blankProfile,
    providers: [] as ProviderCredential[],
    resumes: [] as Resume[],
    runs: [] as SearchRun[],
    seenJobs: [] as SeenJob[],
    matches: [] as JobMatch[],
    activeRun: null as SearchRun | null
  };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Profile>(blankProfile);
  const [providers, setProviders] = useState<ProviderCredential[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [runs, setRuns] = useState<SearchRun[]>([]);
  const [seenJobs, setSeenJobs] = useState<SeenJob[]>([]);
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [activeRun, setActiveRun] = useState<SearchRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function resetWorkspace() {
    const blank = initialWorkspaceData();
    setProfile(blank.profile);
    setProviders(blank.providers);
    setResumes(blank.resumes);
    setRuns(blank.runs);
    setSeenJobs(blank.seenJobs);
    setMatches(blank.matches);
    setActiveRun(blank.activeRun);
  }

  const refresh = useCallback(async () => {
    if (!token) {
      resetWorkspace();
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    resetWorkspace();
    try {
      const [p, pr, rs, ru, sj] = await Promise.all([
        getProfile(token),
        listProviders(token),
        listResumes(token),
        listSearchRuns(token),
        listSeenJobs(token)
      ]);
      setProfile({ ...blankProfile, ...p });
      setProviders(pr);
      setResumes(rs);
      setRuns(ru);
      setSeenJobs(sj);
      const latest = ru[0] ?? null;
      setActiveRun(latest);
      if (latest && (latest.status === "completed" || latest.status === "failed")) {
        setMatches(await getMatches(token, latest.id));
      } else {
        setMatches([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WorkspaceState>(
    () => ({
      loading,
      error,
      profile,
      providers,
      resumes,
      runs,
      seenJobs,
      matches,
      activeRun,
      setProfile,
      setProviders,
      setResumes,
      setRuns,
      setSeenJobs,
      setMatches,
      setActiveRun,
      refresh
    }),
    [loading, error, profile, providers, resumes, runs, seenJobs, matches, activeRun, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

export function useReadiness() {
  const { providers, profile, resumes } = useWorkspace();
  const provider = providers.find((p) => p.is_active) ?? null;
  const resume = resumes[0] ?? null;
  const profileComplete = Boolean(profile.target_role && profile.skills_text);
  return {
    provider,
    resume,
    profileComplete,
    ready: Boolean(provider && resume && profileComplete)
  };
}
