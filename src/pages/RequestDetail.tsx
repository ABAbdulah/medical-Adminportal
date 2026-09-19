import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Play, Trash2 } from "lucide-react";
import { api, ApiError, API_URL, getToken } from "../lib/api";
import type { Brief, CandidateRow, Meta, Paged } from "../lib/types";
import { BRIEF_STATUS_LABEL, QUESTION_TYPE_LABEL, formatDate } from "../lib/types";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CheckSummary, EmptyState, Spinner, Textarea,
} from "../components/ui";

const STATUS_TONE = {
  draft: "neutral", planning: "accent", generating: "accent", ready: "success", failed: "danger",
} as const;

/**
 * Attachments live behind the bearer token, so an <img src> cannot fetch them.
 * Pull the bytes and hand the element an object URL instead.
 */
function AttachmentThumb({ briefId, attachmentId, filename }: { briefId: number; attachmentId: number; filename: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    const token = getToken();
    fetch(`${API_URL}/api/clinician/briefs/${briefId}/attachments/${attachmentId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error("load failed"))))
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [briefId, attachmentId]);

  return src ? (
    <img src={src} alt={filename} className="h-24 w-24 rounded-md border border-border object-cover" />
  ) : (
    <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted">
      {filename.slice(0, 12)}
    </div>
  );
}

export function RequestDetail() {
  const { briefId } = useParams();
  const id = Number(briefId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [instructions, setInstructions] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/clinician/meta") });
  const brief = useQuery({
    queryKey: ["brief", id],
    queryFn: () => api.get<Brief>(`/api/clinician/briefs/${id}`),
    refetchInterval: (query) =>
      query.state.data && ["planning", "generating"].includes(query.state.data.status) ? 4000 : false,
  });

  const candidates = useQuery({
    queryKey: ["candidates", { brief: id }],
    queryFn: () => api.get<Paged<CandidateRow>>(`/api/clinician/candidates?brief_id=${id}&status=all&sort=newest&page_size=100`),
    enabled: Number.isFinite(id),
    refetchInterval: () =>
      brief.data && ["planning", "generating"].includes(brief.data.status) ? 4000 : false,
  });

  const start = useMutation({
    mutationFn: () => api.post(`/api/clinician/briefs/${id}/generate`),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["brief", id] });
    },
    onError: (e) => setActionError((e as ApiError).message),
  });

  const saveInstructions = useMutation({
    mutationFn: (text: string) => api.patch(`/api/clinician/briefs/${id}`, { instructions: text }),
    onSuccess: () => {
      setInstructions(null);
      queryClient.invalidateQueries({ queryKey: ["brief", id] });
    },
    onError: (e) => setActionError((e as ApiError).message),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.upload(`/api/clinician/briefs/${id}/attachments`, form);
    },
    onSuccess: () => {
      setActionError(null);
      if (fileInput.current) fileInput.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["brief", id] });
    },
    onError: (e) => setActionError((e as ApiError).message),
  });

  const removeAttachment = useMutation({
    mutationFn: (attachmentId: number) =>
      api.delete(`/api/clinician/briefs/${id}/attachments/${attachmentId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["brief", id] }),
    onError: (e) => setActionError((e as ApiError).message),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/clinician/briefs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["briefs"] });
      navigate("/generate");
    },
    onError: (e) => setActionError((e as ApiError).message),
  });

  if (brief.isLoading) return <Spinner />;
  if (brief.error) return <Alert>{(brief.error as Error).message}</Alert>;
  const b = brief.data!;
  const running = b.status === "planning" || b.status === "generating";
  // The API restricts changing a request to its creator or an admin; everyone
  // else sees it read-only rather than buttons that are guaranteed to 403.
  const canEdit = b.created_by === meta?.user_id || Boolean(meta?.is_admin);

  return (
    <div className="space-y-4">
      <Link to="/generate" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{b.title}</h1>
          <p className="text-sm text-muted">
            {b.topic} · {b.department} · {b.created_by_name ?? "Unknown"} · {formatDate(b.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[b.status]}>{BRIEF_STATUS_LABEL[b.status]}</Badge>
          <span className="text-sm text-muted">{b.generated_count}/{b.target_count} written</span>
        </div>
      </div>

      {actionError && <Alert>{actionError}</Alert>}
      {b.last_error && <Alert tone="warning">Last run stopped: {b.last_error}</Alert>}
      {b.stale && (
        <Alert tone="warning">
          This request looks stuck — the previous run stopped without finishing. You can start it again.
        </Alert>
      )}

      {!canEdit && (
        <Alert tone="neutral">
          {b.created_by_name ?? "Another doctor"} created this request, so only they or an administrator can
          change it or start it. You can still review the questions it produces.
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button loading={start.isPending} disabled={running && !b.stale} onClick={() => start.mutate()}>
            <Play className="h-4 w-4" />
            {b.generated_count > 0 ? "Write more questions" : "Start writing"}
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate(`/review?brief_id=${id}`)}>
          Review these questions
        </Button>
        {canEdit && (
          <Button variant="ghost" className="text-danger" loading={remove.isPending}
            onClick={() => {
              if (window.confirm("Delete this request? Questions already written stay in the review queue.")) {
                remove.mutate();
              }
            }}>
            <Trash2 className="h-4 w-4" /> Delete request
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Instructions to the AI"
            description="Edited instructions apply to the next run, not to questions already written." />
          <CardBody className="space-y-3">
            <Textarea rows={8} maxLength={8000} disabled={!canEdit} value={instructions ?? b.instructions}
              onChange={(e) => setInstructions(e.target.value)} />
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" disabled={instructions === null || instructions === b.instructions}
                  loading={saveInstructions.isPending}
                  onClick={() => saveInstructions.mutate(instructions ?? "")}>
                  Save instructions
                </Button>
                {instructions !== null && (
                  <Button size="sm" variant="ghost" onClick={() => setInstructions(null)}>Undo</Button>
                )}
              </div>
            )}
            <div className="text-sm text-muted">
              <p className="font-medium text-foreground">Styles</p>
              <p>{b.question_types.map((t) => QUESTION_TYPE_LABEL[t]).join(", ")}</p>
              <p className="mt-2 font-medium text-foreground">Difficulty mix</p>
              <p>{Object.entries(b.difficulty_mix).map(([k, v]) => `${k} ${v}`).join(" · ")}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Images"
            description="Attach ECGs, X-rays, photos or a screenshot of the style you want. PNG, JPEG or WebP up to 5 MB." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(b.attachments ?? []).map((a) => (
                <div key={a.id} className="relative">
                  <AttachmentThumb briefId={b.id} attachmentId={a.id} filename={a.filename} />
                  {canEdit && (
                    <button type="button" aria-label={`Remove ${a.filename}`}
                      onClick={() => removeAttachment.mutate(a.id)}
                      className="absolute -right-2 -top-2 rounded-full border border-border bg-surface p-1 text-muted hover:text-danger">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {(b.attachments ?? []).length === 0 && (
                <p className="text-sm text-muted">No images attached.</p>
              )}
            </div>
            {canEdit && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-2">
                <ImagePlus className="h-4 w-4" />
                {upload.isPending ? "Uploading…" : "Add an image"}
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload.mutate(f);
                  }} />
              </label>
            )}
          </CardBody>
        </Card>
      </div>

      {b.example_mcqs && (
        <Card>
          <CardHeader title="Example questions given to the AI" />
          <CardBody>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm text-muted">{b.example_mcqs}</pre>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title={`Questions written (${candidates.data?.total ?? 0})`} description="Newest first" />
        <CardBody className="p-0">
          {candidates.isLoading ? (
            <Spinner />
          ) : (candidates.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="Nothing written yet"
              description={running ? "The AI is working — this list updates on its own." : "Start the request to have the AI draft questions."} />
          ) : (
            <ul>
              {candidates.data!.items.map((c) => (
                <li key={c.id} className="border-b border-border/60 last:border-0">
                  <Link to={`/review/${c.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{c.stem_preview}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {c.angle ?? c.topic} · {QUESTION_TYPE_LABEL[c.question_type]}
                      </span>
                    </span>
                    <CheckSummary fail={c.checks.fail} warn={c.checks.warn} />
                    <time dateTime={c.created_at ?? undefined} title="Generated"
                      className="w-28 whitespace-nowrap text-right text-xs tabular-nums text-muted">
                      {formatDate(c.created_at)}
                    </time>
                    <Badge tone={c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : "neutral"}>
                      {c.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
