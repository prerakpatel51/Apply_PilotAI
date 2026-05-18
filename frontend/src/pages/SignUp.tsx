import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Mail, UserRound } from "lucide-react";
import { signup } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { Banner } from "../components/ui/Banner";
import { AuthShell, PasswordInput } from "./SignIn";

export function SignUpPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await signup(email, password, fullName);
      login(res.access_token, true);
      navigate("/app/provider");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with your profile, then connect the provider you want the agents to use."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/signin" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <Field label="Full name">
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            leftIcon={<UserRound size={16} />}
          />
        </Field>
        <Field label="Email" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            leftIcon={<Mail size={16} />}
          />
        </Field>
        <Field label="Password" required hint="At least 8 characters.">
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((current) => !current)}
          />
        </Field>
        {error && <Banner tone="danger" title="Sign up failed">{error}</Banner>}
        <Button fullWidth size="lg" type="submit" loading={busy} rightIcon={<ArrowRight size={16} />}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
