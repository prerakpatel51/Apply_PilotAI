import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  KeyRound,
  LogOut,
  Radar,
  Search,
  History,
  FileText,
  Files,
  UserRound,
  Briefcase,
  Gauge,
  Settings,
  Shield
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useReadiness } from "../lib/workspace";
import { cn } from "../lib/cn";
import { Button } from "./ui/Button";
import { ThemeToggle } from "./ui/ThemeToggle";
import { Badge } from "./ui/Badge";
import { Tokenometer } from "./Tokenometer";

const nav = [
  { to: "/app/search", label: "Search", icon: Search, key: "search" },
  { to: "/app/jobs", label: "Job matches", icon: Briefcase, key: "jobs" },
  { to: "/app/generated-resumes", label: "Generated resumes", icon: Files, key: "generated-resumes" },
  { to: "/app/history", label: "Previous jobs", icon: History, key: "history" },
  { to: "/app/usage", label: "Usage", icon: Gauge, key: "usage" },
  { to: "/app/provider", label: "API provider", icon: KeyRound, key: "provider" },
  { to: "/app/profile", label: "Candidate profile", icon: UserRound, key: "profile" },
  { to: "/app/resume", label: "Resume", icon: FileText, key: "resume" },
  { to: "/app/settings", label: "Settings", icon: Settings, key: "settings" }
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { provider, resume, profileComplete } = useReadiness();

  const navItems = user?.is_admin
    ? [...nav, { to: "/app/admin", label: "Admin", icon: Shield, key: "admin" }]
    : nav;

  const readyMap: Record<string, boolean> = {
    provider: Boolean(provider),
    profile: profileComplete,
    resume: Boolean(resume)
  };

  function signOut() {
    logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-full overflow-x-hidden bg-bg text-fg flex">
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-surface/60">
        <Link
          to="/"
          className="px-5 h-16 flex items-center gap-3 border-b border-border transition-colors hover:bg-muted/40"
          aria-label="Go to home page"
        >
          <div className="h-9 w-9 rounded-xl bg-accent text-accent-fg flex items-center justify-center shadow-soft">
            <Radar size={18} />
          </div>
          <div className="leading-tight">
            <p className="text-[11px] uppercase tracking-[0.16em] text-subtle">ApplyPilot</p>
            <p className="text-sm font-semibold">ApplyPilot AI</p>
          </div>
        </Link>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
          {navItems.map(({ to, label, icon: Icon, key }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-muted text-fg"
                    : "text-subtle hover:bg-muted/60 hover:text-fg"
                )
              }
            >
              <Icon size={16} />
              <span className="flex-1 truncate">{label}</span>
              {key in readyMap && !readyMap[key] && (
                <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label="Needs setup" />
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
              {(user?.email?.[0] ?? "U").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.full_name || user?.email}</p>
              <p className="text-xs text-subtle truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Sign out"
              onClick={signOut}
              leftIcon={<LogOut size={15} />}
            >
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 border-b border-border bg-surface/70 backdrop-blur sticky top-0 z-10">
          <div className="h-full px-4 sm:px-5 lg:px-8 flex items-center gap-3">
            <Link to="/" className="lg:hidden flex min-w-0 items-center gap-2" aria-label="Go to home page">
              <div className="h-8 w-8 rounded-lg bg-accent text-accent-fg flex items-center justify-center">
                <Radar size={16} />
              </div>
              <span className="text-sm font-semibold">ApplyPilot AI</span>
            </Link>
            <div className="hidden md:flex items-center gap-2 ml-auto">
              <Tokenometer />
              <Badge tone={resume ? "success" : "outline"}>
                {resume ? "Resume ready" : "No resume"}
              </Badge>
              <Badge tone={profileComplete ? "success" : "outline"}>
                {profileComplete ? "Profile complete" : "Profile pending"}
              </Badge>
            </div>
            <div className="ml-auto md:ml-2 flex items-center gap-2">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="sm"
                aria-label="Sign out"
                onClick={signOut}
                leftIcon={<LogOut size={15} />}
              >
                <span className="hidden sm:inline">Logout</span>
                <span className="sr-only sm:hidden">Logout</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 min-w-0 px-4 sm:px-5 lg:px-8 py-5 sm:py-6 lg:py-8 pb-24 lg:pb-8 max-w-[1400px] w-full mx-auto animate-fade-in">
          <Outlet />
        </main>

        <nav className="lg:hidden border-t border-border bg-surface/95 backdrop-blur fixed inset-x-0 bottom-0 z-20">
          <div className="flex gap-1 overflow-x-auto px-2 py-1.5 scrollbar-thin">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex min-w-[4.4rem] flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[10px] font-medium",
                    isActive ? "bg-accent/10 text-accent" : "text-subtle"
                  )
                }
              >
                <Icon size={18} />
                <span className="w-full truncate text-center">{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
