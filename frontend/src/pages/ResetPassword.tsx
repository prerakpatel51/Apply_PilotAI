import { FormEvent, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { resetPassword } from "../lib/api";
import { AuthShell, PasswordInput } from "./SignIn";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Input";
import { Banner } from "../components/ui/Banner";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    if (!token) {
      setError("Reset link is missing a token.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const res = await resetPassword(token, password);
      setMessage(res.message);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Use a password you have not used for this account before."
      footer={
        <>
          Ready to continue?{" "}
          <Link to="/signin" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        {!token && (
          <Banner tone="danger" title="Invalid reset link">
            Open the reset link from your email, or request a new one.
          </Banner>
        )}
        <Field label="New password" required hint="At least 8 characters.">
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((current) => !current)}
          />
        </Field>
        <Field label="Confirm password" required>
          <PasswordInput
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            showPassword={showConfirmPassword}
            onTogglePassword={() => setShowConfirmPassword((current) => !current)}
          />
        </Field>
        {message && (
          <Banner tone="success" title="Password updated">
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 size={15} />
              {message}
            </span>
          </Banner>
        )}
        {error && <Banner tone="danger" title="Reset failed">{error}</Banner>}
        <Button fullWidth size="lg" type="submit" loading={busy} disabled={!token} rightIcon={<ArrowRight size={16} />}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
