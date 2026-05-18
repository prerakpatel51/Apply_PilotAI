import { useEffect, useMemo, useState } from "react";
import { Download, FileText, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import {
  deleteGeneratedResume,
  deleteResume,
  generatedResumeDownloadUrl,
  listGeneratedResumes,
  listResumes
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type { GeneratedResume, Resume } from "../lib/types";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/ui/Badge";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Input } from "../components/ui/Input";
import { Skeleton } from "../components/ui/Skeleton";

export function GeneratedResumesPage() {
  const { token } = useAuth();
  const [generated, setGenerated] = useState<GeneratedResume[]>([]);
  const [uploaded, setUploaded] = useState<Resume[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState("");
  const [error, setError] = useState("");

  const filteredGenerated = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return generated;
    return generated.filter((item) =>
      `${item.company} ${item.position} ${item.file_base}`.toLowerCase().includes(q)
    );
  }, [generated, query]);

  const filteredUploaded = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return uploaded;
    return uploaded.filter((item) =>
      `${item.file_name} ${item.extracted_preview}`.toLowerCase().includes(q)
    );
  }, [uploaded, query]);

  async function load() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const [uploadedRows, generatedRows] = await Promise.all([
        listResumes(token),
        listGeneratedResumes(token)
      ]);
      setUploaded(uploadedRows);
      setGenerated(generatedRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load generated resumes.");
    } finally {
      setLoading(false);
      setBusy(false);
    }
  }

  async function removeUploaded(item: Resume) {
    if (!token) return;
    if (!window.confirm(`Delete uploaded resume "${item.file_name}"? Generated resumes that used it will stay in history.`)) return;
    setDeleting(`uploaded-${item.id}`);
    setError("");
    try {
      await deleteResume(token, item.id);
      setUploaded((rows) => rows.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete uploaded resume.");
    } finally {
      setDeleting("");
    }
  }

  async function removeGenerated(item: GeneratedResume) {
    if (!token) return;
    if (!window.confirm(`Delete generated resume for "${item.position}" at ${item.company}?`)) return;
    setDeleting(`generated-${item.id}`);
    setError("");
    try {
      await deleteGeneratedResume(token, item.id);
      setGenerated((rows) => rows.filter((row) => row.id !== item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete generated resume.");
    } finally {
      setDeleting("");
    }
  }

  async function download(item: GeneratedResume, kind: "tex" | "pdf") {
    if (!token) return;
    const response = await fetch(generatedResumeDownloadUrl(item.id, kind), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      setError(`Could not download ${kind.toUpperCase()} for ${item.position}.`);
      return;
    }
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${item.file_base}.${kind}`;
    link.click();
    URL.revokeObjectURL(href);
  }

  useEffect(() => {
    void load();
  }, [token]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resume history"
        title="Resume library"
        description="Track uploaded master resumes and every job-aligned generated resume."
        actions={
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void load()} loading={busy} leftIcon={<RefreshCw size={14} />}>
            Refresh
          </Button>
        }
      />

      {error && <Banner tone="danger" title="Could not update">{error}</Banner>}

      <Card>
        <CardBody>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company, role, uploaded resume, or file name"
            leftIcon={<Search size={15} />}
          />
        </CardBody>
      </Card>

      {loading ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : filteredUploaded.length || filteredGenerated.length ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Uploaded resumes</h2>
              <Badge tone="outline">{filteredUploaded.length}</Badge>
            </div>
            {filteredUploaded.length ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredUploaded.map((item) => (
                  <Card key={item.id}>
                    <CardHeader
                      eyebrow={new Date(item.created_at).toLocaleString()}
                      title={item.file_name}
                      description={item.content_type || "Uploaded resume"}
                      icon={<Upload size={16} />}
                    />
                    <CardBody className="space-y-4">
                      <p className="text-sm text-subtle line-clamp-4 break-anywhere">{item.extracted_preview || "No extracted preview available."}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-danger sm:w-auto"
                        onClick={() => void removeUploaded(item)}
                        loading={deleting === `uploaded-${item.id}`}
                        leftIcon={<Trash2 size={14} />}
                      >
                        Delete uploaded resume
                      </Button>
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-subtle">No uploaded resumes match your search.</p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Generated aligned resumes</h2>
              <Badge tone="outline">{filteredGenerated.length}</Badge>
            </div>
            {filteredGenerated.length ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredGenerated.map((item) => (
                  <Card key={item.id}>
                    <CardHeader
                      eyebrow={new Date(item.updated_at).toLocaleString()}
                      title={item.position}
                      description={item.company}
                      icon={<FileText size={16} />}
                    />
                    <CardBody className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={item.compile_status === "compiled" ? "success" : item.compile_status === "failed" ? "danger" : "outline"}>
                          {item.compile_status}
                        </Badge>
                        {item.model && <Badge tone="outline">{item.model}</Badge>}
                      </div>
                      <p className="text-xs font-mono text-subtle break-anywhere">{item.file_base}</p>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => void download(item, "tex")} leftIcon={<Download size={14} />}>
                          LaTeX
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void download(item, "pdf")}
                          disabled={!item.has_pdf}
                          leftIcon={<Download size={14} />}
                        >
                          PDF
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger"
                          onClick={() => void removeGenerated(item)}
                          loading={deleting === `generated-${item.id}`}
                          leftIcon={<Trash2 size={14} />}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-subtle">No generated resumes match your search.</p>
            )}
          </section>
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={20} />}
          title="No resumes found"
          description="Upload a resume or open a job match and generate an aligned resume."
        />
      )}
    </div>
  );
}
