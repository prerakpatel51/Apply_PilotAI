import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Mail } from "lucide-react";
import { forgotPassword } from "../lib/api";
import { AuthShell } from "./SignIn";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Banner } from "../components/ui/Banner";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [resetUrl, setResetUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setResetUrl("");
    setError("");
    setBusy(true);
    try {
      const res = await forgotPassword(email);
      setMessage(res.message);
      setResetUrl(res.reset_url ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we will send a secure reset link."
      footer={
        <>
          Remember your password?{" "}
          <Link to="/signin" className="font-semibold text-accent hover:underline">
            Sign in
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
        {message && (
          <Banner tone="success" title={resetUrl ? "Reset link created" : "Check your email"}>
            <span className="space-y-2 block">
              <span className="block">{message}</span>
              {resetUrl && (
                <a href={resetUrl} className="font-semibold text-accent hover:underline">
                  Open reset password page
                </a>
              )}
            </span>
          </Banner>
        )}
        {error && <Banner tone="danger" title="Could not send email">{error}</Banner>}
        <Button fullWidth size="lg" type="submit" loading={busy} rightIcon={<ArrowRight size={16} />}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
}
