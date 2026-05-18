import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, FileUp, Loader2, Sparkles } from "lucide-react";
import { listResumes, uploadResume } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWorkspace } from "../lib/workspace";
import { PageHeader } from "../components/PageHeader";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Banner } from "../components/ui/Banner";
import { Badge } from "../components/ui/Badge";

export function ResumePage() {
  const { token } = useAuth();
  const { resumes, setResumes } = useWorkspace();
  const latest = resumes[0];
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError("");
    setUploading(true);
    try {
      await uploadResume(token!, file);
      setResumes(await listResumes(token!));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload resume.");
    } finally {
      setUploading(false);
    }
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        eyebrow="Step 3"
        title="Upload your resume"
        description="We use it to score job fit and surface gaps. Your file stays on your account."
      />

      {error && <Banner tone="danger" title="Upload failed">{error}</Banner>}

      <Card>
        <CardHeader eyebrow="Resume" title="Drop your file" icon={<FileText size={18} />} />
        <CardBody>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            className={
              "rounded-2xl border-2 border-dashed transition-colors cursor-pointer p-10 text-center " +
              (dragging
                ? "border-accent bg-accent/8"
                : "border-border bg-bg/40 hover:bg-muted/40 hover:border-fg/20")
            }
          >
            <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-subtle mb-4">
              {uploading ? <Loader2 className="animate-spin" size={22} /> : <FileUp size={22} />}
            </div>
            <p className="text-base font-semibold">
              {uploading ? "Uploading and parsing…" : "Drag your resume here, or click to choose"}
            </p>
            <p className="text-sm text-subtle mt-1">LaTeX (.tex) or plain text only. Max 5 MB.</p>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".tex,.txt,.text,text/plain,application/x-tex"
              onChange={onChange}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-4 text-xs text-subtle">
            <Badge tone="outline">LaTeX</Badge>
            <Badge tone="outline">Plain text</Badge>
            <span>•</span>
            <span>Text-first inputs keep parsing predictable for matching and resume alignment.</span>
          </div>
        </CardBody>
      </Card>

      {latest && (
        <Card>
          <CardHeader
            eyebrow="Latest upload"
            title={latest.file_name}
            description="Preview of the parsed text we'll feed to the matching agent."
            icon={<Sparkles size={18} className="text-accent" />}
            action={
              <Link to="/app/search">
                <Button rightIcon={<ArrowRight size={14} />}>Continue</Button>
              </Link>
            }
          />
          <CardBody>
            <div className="rounded-xl border border-border bg-bg/40 p-4 max-h-72 overflow-auto scrollbar-thin text-sm text-fg whitespace-pre-wrap font-mono leading-relaxed">
              {latest.extracted_preview || "No readable text found in this file."}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
