import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Radar
} from "lucide-react";
import { signin } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Banner } from "../components/ui/Banner";

export function SignInPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await signin(email, password);
      login(res.access_token, remember);
      navigate("/app/search");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to review saved searches, ranked jobs, and recent agent runs."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <Field label="Email" required>
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            leftIcon={<Mail size={16} />}
          />
        </Field>
        <Field label="Password" required>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((current) => !current)}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-subtle select-none">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border text-accent focus:ring-0"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember this device
          </label>
          <Link to="/forgot-password" className="text-sm font-medium text-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        {error && <Banner tone="danger" title="Sign in failed">{error}</Banner>}
        <Button fullWidth size="lg" type="submit" loading={busy} rightIcon={<ArrowRight size={16} />}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  showPassword,
  onTogglePassword,
  minLength = 8
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  showPassword: boolean;
  onTogglePassword: () => void;
  minLength?: number;
}) {
  return (
    <div className="relative">
      <Input
        type={showPassword ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={minLength}
        leftIcon={<Lock size={16} />}
        className="pr-11"
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-muted hover:text-fg focus:outline-none focus:ring-2 focus:ring-accent/40"
        onClick={onTogglePassword}
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
      >
        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  footer,
  children
}: {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-bg via-bg to-muted text-fg">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-fg">
              <Radar size={18} />
            </span>
            <span className="text-sm font-semibold">ApplyPilot AI</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-subtle hover:text-fg">
            Back to home
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <section className="w-full max-w-[29rem] rounded-2xl border border-border bg-surface p-5 shadow-soft sm:p-8">
            <div className="mb-7">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-accent">
                <Radar size={21} />
              </div>
              <h1 className="text-3xl font-semibold">{title}</h1>
              <p className="mt-2 text-sm leading-6 text-subtle">{subtitle}</p>
            </div>
            {children}
            <div className="mt-6 border-t border-border pt-5 text-center text-sm text-subtle">
              {footer}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
