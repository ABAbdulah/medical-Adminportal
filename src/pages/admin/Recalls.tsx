import { Fragment, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CheckCircle2, ChevronDown, ChevronRight, FileText, UploadCloud } from "lucide-react";
import { api } from "../../lib/api";
import { formatDay, type RecallDoc, type RecallTopicRow } from "../../lib/admin-types";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Spinner } from "../../components/ui";

/** Mirrors the backend's 15 MB recall-PDF cap so an oversized file fails here, not after the upload. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;

interface UploadResult {
  id: number;
  status: string;
  topics_extracted: number;
}

function statusTone(status: string): "warning" | "accent" | "success" | "danger" | "neutral" {
  return (
    { processing: "warning", processed: "accent", approved: "success", failed: "danger" } as const
  )[status as "processing"] ?? "neutral";
}

function RecallTopics({ docId }: { docId: number }) {
  const topics = useQuery({
    queryKey: ["admin", "recall-topics", docId],
    queryFn: () => api.get<RecallTopicRow[]>(`/api/admin/recalls/${docId}/topics`),
  });
  if (topics.isLoading) return <Spinner label="Loading topics…" />;
  if (topics.error) return <Alert>{(topics.error as Error).message}</Alert>;
  if (!topics.data?.length) return <p className="text-sm text-muted">No topics extracted for this document.</p>;
  return (
    <ul className="space-y-1.5">
      {topics.data.map((t) => (
        <li key={t.id}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-surface-2/50 px-3 py-2 text-sm">
          <span className="font-medium">{t.topic}</span>
          {t.subtopic && <span className="text-xs text-muted">· {t.subtopic}</span>}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            <Badge>{t.subject}</Badge>
            <span className="text-xs tabular-nums text-muted">×{t.frequency}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AdminRecalls() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [examMonth, setExamMonth] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const docs = useQuery({
    queryKey: ["admin", "recalls"],
    queryFn: () => api.get<RecallDoc[]>("/api/admin/recalls"),
    // keep polling while any document is still being processed
    refetchInterval: (query) => (query.state.data?.some((d) => d.status === "processing") ? 5000 : false),
  });

  const upload = useMutation({
    mutationFn: ({ month, pdf }: { month: string; pdf: File }) => {
      const form = new FormData();
      form.append("exam_month", month);
      form.append("file", pdf);
      return api.upload<UploadResult>("/api/admin/recalls/upload", form);
    },
    onSuccess: () => {
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    },
    // the document may exist with status=failed even when the call errors
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "recalls"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const approve = useMutation({
    mutationFn: (id: number) => api.patch(`/api/admin/recalls/${id}/approve`, {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "recalls"] }),
  });

  function pick(f: File | null | undefined) {
    setPickError(null);
    upload.reset();
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setPickError("Only PDF files are supported.");
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setPickError("That PDF is larger than 15 MB.");
      return;
    }
    setFile(f);
  }

  function submit() {
    if (!file) return setPickError("Choose a PDF first.");
    if (!/^\d{4}-\d{2}$/.test(examMonth)) return setPickError("Pick the exam month.");
    upload.mutate({ month: examMonth, pdf: file });
  }

  function toggle(id: number) {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Recall documents</h1>
        <p className="text-sm text-muted">
          Upload exam recall PDFs. AI extracts the recurring topics for the students' recall analytics.
        </p>
      </div>

      <Card>
        <CardHeader title="Upload a recall PDF"
          description="Text is extracted and the AI identifies recurring exam topics — large files can take a minute." />
        <CardBody className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop a PDF here or click to browse"
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
            className={clsx(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 text-center transition-colors",
              dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/60",
            )}
          >
            <FileText className="h-8 w-8 text-muted" />
            {file ? (
              <p className="text-sm font-medium">{file.name}</p>
            ) : (
              <p className="text-sm text-muted">
                Drag &amp; drop a PDF here, or <span className="text-accent">browse</span> (max 15 MB)
              </p>
            )}
            <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden"
              onChange={(e) => pick(e.target.files?.[0])} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Exam month" htmlFor="exam-month">
              <Input id="exam-month" type="month" className="sm:w-44" value={examMonth}
                disabled={upload.isPending} onChange={(e) => setExamMonth(e.target.value)} />
            </Field>
            <Button onClick={submit} loading={upload.isPending} disabled={!file}>
              {!upload.isPending && <UploadCloud className="h-4 w-4" />} Upload &amp; extract topics
            </Button>
            {upload.isPending && <span className="text-xs text-muted">Processing the PDF and extracting topics…</span>}
          </div>

          {pickError && <Alert>{pickError}</Alert>}
          {upload.error && <Alert>{(upload.error as Error).message}</Alert>}
          {upload.data && (
            <Alert tone="success">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> Processed — {upload.data.topics_extracted} topic
                {upload.data.topics_extracted === 1 ? "" : "s"} extracted. Review and approve below.
              </span>
            </Alert>
          )}
        </CardBody>
      </Card>

      {approve.error && <Alert>{(approve.error as Error).message}</Alert>}

      {docs.isLoading ? (
        <Spinner />
      ) : docs.error ? (
        <Alert>{(docs.error as Error).message}</Alert>
      ) : !docs.data?.length ? (
        <EmptyState title="No recall documents yet" description="Upload a PDF above to start building recall analytics." />
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Exam month</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.data.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="border-b border-border/60 last:border-0">
                      <td className="max-w-xs px-4 py-3 font-medium">
                        <button type="button" className="flex w-full items-center gap-1.5 text-left hover:text-accent"
                          aria-expanded={expandedId === d.id} onClick={() => toggle(d.id)}>
                          {expandedId === d.id
                            ? <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                            : <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
                          <span className="truncate">{d.filename}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted">{d.exam_month}</td>
                      <td className="px-4 py-3"><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                      <td className="px-4 py-3 text-muted">{formatDay(d.upload_date)}</td>
                      <td className="px-4 py-3 text-right">
                        {d.status === "processed" && (
                          <Button variant="success" size="sm" loading={approve.isPending && approve.variables === d.id}
                            onClick={() => approve.mutate(d.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expandedId === d.id && (
                      <tr className="border-b border-border/60 last:border-0">
                        <td colSpan={5} className="bg-surface-2/30 px-4 py-3">
                          <p className="mb-2 text-xs font-medium text-muted">Extracted topics</p>
                          <RecallTopics docId={d.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-3 md:hidden">
            {docs.data.map((d) => (
              <Card key={d.id} className="space-y-2 p-4">
                <button type="button" className="flex w-full items-start justify-between gap-2 text-left"
                  aria-expanded={expandedId === d.id} onClick={() => toggle(d.id)}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {expandedId === d.id
                      ? <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
                      : <ChevronRight className="h-4 w-4 shrink-0 text-muted" />}
                    <span className="min-w-0 truncate text-sm font-medium">{d.filename}</span>
                  </span>
                  <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                </button>
                <p className="text-xs text-muted">Exam {d.exam_month} · Uploaded {formatDay(d.upload_date)}</p>
                {d.status === "processed" && (
                  <Button variant="success" size="sm" loading={approve.isPending && approve.variables === d.id}
                    onClick={() => approve.mutate(d.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                )}
                {expandedId === d.id && (
                  <div className="rounded-md bg-surface-2/30 p-3">
                    <RecallTopics docId={d.id} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
