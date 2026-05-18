import { Navigate, NavLink, Outlet } from "react-router-dom";
import { Activity, FlaskConical, ScrollText, Server, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { cn } from "../../lib/cn";

const tabs = [
  { to: "/app/admin", end: true, label: "Overview", icon: ShieldCheck },
  { to: "/app/admin/users", label: "Users", icon: Users },
  { to: "/app/admin/runs", label: "Runs", icon: Activity },
  { to: "/app/admin/prompts", label: "Prompts", icon: SlidersHorizontal },
  { to: "/app/admin/analytics", label: "Analytics", icon: FlaskConical },
  { to: "/app/admin/audit", label: "Audit", icon: ScrollText },
  { to: "/app/admin/system", label: "System", icon: Server }
];

export function AdminLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/signin" replace />;
  if (!user.is_admin) return <Navigate to="/app/search" replace />;

  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted border border-border w-fit">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-surface text-fg shadow-soft" : "text-subtle hover:text-fg"
              )
            }
          >
            <Icon size={14} />
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
