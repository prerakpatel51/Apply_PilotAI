import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Settings as SettingsIcon, ShieldAlert, Trash2 } from "lucide-react";
import { deleteMyAccount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PageHeader } from "../components/PageHeader";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Field } from "../components/ui/Input";
import { Banner } from "../components/ui/Banner";

export function SettingsPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const canDelete = confirm.trim().toLowerCase() === (user?.email ?? "").toLowerCase();

  async function deleteAccount() {
    if (!canDelete) return;
    setError("");
    setWorking(true);
    try {
      await deleteMyAccount(token!);
      logout();
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete account.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Sign out or permanently delete your account."
      />

      <Card>
        <CardHeader
          eyebrow="Session"
          title="Sign out"
          description="End this session on this device. Your saved data is kept."
          icon={<LogOut size={18} />}
        />
        <CardBody>
          <Button
            variant="outline"
            leftIcon={<LogOut size={14} />}
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
          >
            Sign out
          </Button>
        </CardBody>
      </Card>

      <Card className="border-danger/35 bg-danger/5">
        <CardHeader
          eyebrow="Danger zone"
          title="Delete account"
          description="Permanently remove your profile, resume, providers, search runs, and matches. This cannot be undone."
          icon={<ShieldAlert size={18} className="text-danger" />}
        />
        <CardBody className="space-y-4">
          {error && <Banner tone="danger" title="Could not delete">{error}</Banner>}

          {!confirming ? (
            <Button
              variant="danger"
              leftIcon={<Trash2 size={14} />}
              onClick={() => setConfirming(true)}
            >
              Close my account
            </Button>
          ) : (
            <div className="rounded-xl border border-danger/35 bg-bg/40 p-4 space-y-3">
              <p className="text-sm text-fg">
                Type your email <span className="font-mono text-danger">{user?.email}</span> below to confirm. This action is irreversible.
              </p>
              <Field label="Email to confirm">
                <Input
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={user?.email ?? ""}
                  autoComplete="off"
                  autoFocus
                />
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="danger"
                  loading={working}
                  disabled={!canDelete}
                  leftIcon={<Trash2 size={14} />}
                  onClick={deleteAccount}
                >
                  Delete account permanently
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setConfirming(false);
                    setConfirm("");
                    setError("");
                  }}
                  disabled={working}
                >
                  Cancel
                </Button>
                <span className="text-xs text-subtle inline-flex items-center gap-1.5">
                  <SettingsIcon size={12} />
                  We delete your profile, resumes, providers, search runs, matches, and seen-jobs history.
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
