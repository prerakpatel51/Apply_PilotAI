import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getUsage } from "./api";
import { useAuth } from "./auth";
import type { UsageSnapshot } from "./types";

/**
 * Push-style tokenometer.
 *
 * The provider does ONE initial pull when the auth context mounts so the topbar
 * has a baseline number to render. After that it never polls — every consumer
 * triggers `refresh()` explicitly when a token-spending action completes
 * (search run finished, resume extraction finished, etc.). This keeps the
 * server cost flat per user (≈ 1 GET on login + 1 GET per user-initiated job)
 * instead of N polls/minute, which would not scale.
 */
type Ctx = {
  snapshot: UsageSnapshot | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const TokenometerCtx = createContext<Ctx | null>(null);

export function TokenometerProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(token));
  const [error, setError] = useState<string>("");
  const inflightRef = useRef<boolean>(false);

  const pull = useCallback(async () => {
    if (!token || inflightRef.current) return;
    inflightRef.current = true;
    try {
      const data = await getUsage(token);
      setSnapshot(data);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Token usage unavailable.");
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    void pull();
  }, [token, pull]);

  const value: Ctx = { snapshot, loading, error, refresh: pull };
  return <TokenometerCtx.Provider value={value}>{children}</TokenometerCtx.Provider>;
}

export function useTokenometer() {
  const ctx = useContext(TokenometerCtx);
  if (!ctx) throw new Error("useTokenometer must be used inside TokenometerProvider");
  return ctx;
}
