import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { CandidateDetail, Meta } from "../lib/types";
import { DIFFICULTY_LABEL, ORIGIN_LABEL, QUESTION_TYPE_LABEL, formatDate } from "../lib/types";
import { QuestionForm, draftToPayload, validateQuestion } from "../components/QuestionForm";
import type { QuestionDraft } from "../components/QuestionForm";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CheckList, Field, Modal, Spinner, Textarea,
} from "../components/ui";

function toDraft(c: CandidateDetail): QuestionDraft {
  return {
    topic: c.topic,
    question_type: c.question_type,
    difficulty: c.difficulty,
    question_text: c.question_text,
    options: c.options,
    explanation: c.explanation,
    learning_point: c.learning_point ?? "",
    source_code: c.source_code ?? "",
    reference: c.reference ?? "",
  };
}

export function ReviewOne() {
  const { candidateId } = useParams();
  const id = Number(candidateId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/clinician/meta") });
  const candidate = useQuery({
    queryKey: ["candidate", id],
    queryFn: () => api.get<CandidateDetail>(`/api/clinician/candidates/${id}`),
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ qid: number } | null>(null);

  // Moving to the next question must not carry the previous one's editor state.
  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setEditErrors([]);
    setNotes("");
    setReason("");
    setActionError(null);
    setPublished(null);
  }, [id]);

  const afterDecision = (next: CandidateDetail) => {
    queryClient.setQueryData(["candidate", id], next);
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<CandidateDetail>(`/api/clinician/candidates/${id}`, {
        ...draftToPayload(draft!),
        department_id: candidate.data!.department_id,
        notes: notes.trim() || null,
      }),
    onSuccess: (next) => {
      setEditing(false);
      setDraft(null);
      setActionError(null);
      afterDecision(next);
    },
    onError: (e) => setActionError((e as ApiError).message),
  });

  const approve = useMutation({
    mutationFn: () => api.post<CandidateDetail>(`/api/clinician/candidates/${id}/approve`, { notes: notes.trim() || null }),
    onSuccess: (next) => {
      setActionError(null);
      setPublished(next.published ? { qid: next.published.qid } : null);
      afterDecision(next);
      if (!next.published && next.next_pending_id) navigate(`/review/${next.next_pending_id}`);
    },
    onError: (e) => setActionError((e as ApiError).message),
  });

  const reject = useMutation({
    mutationFn: () => api.post<CandidateDetail>(`/api/clinician/candidates/${id}/reject`, { reason: reason.trim() }),
    onSuccess: (next) => {
      setRejecting(false);
      setActionError(null);
      afterDecision(next);
      if (next.next_pending_id) navigate(`/review/${next.next_pending_id}`);
    },
    onError: (e) => setActionError((e as ApiError).message),
  });

  if (candidate.isLoading) return <Spinner />;
  if (candidate.error) return <Alert>{(candidate.error as Error).message}</Alert>;
  const c = candidate.data!;
  const blocking = c.check_details.some((x) => x.level === "fail");
  const mine = c.created_by !== null && c.created_by === meta?.user_id;
  const allowSelf = Boolean(meta?.settings?.["review.allow_self_approval"]) || Boolean(meta?.is_admin);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/review" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Review queue
        </Link>
        <span className="ml-auto flex gap-1">
          <Button variant="outline" size="sm" disabled={!c.prev_pending_id}
            onClick={() => navigate(`/review/${c.prev_pending_id}`)}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          <Button variant="outline" size="sm" disabled={!c.next_pending_id}
            onClick={() => navigate(`/review/${c.next_pending_id}`)}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{c.topic}</h1>
        <Badge>{QUESTION_TYPE_LABEL[c.question_type]}</Badge>
        <Badge>{DIFFICULTY_LABEL[c.difficulty]}</Badge>
        <Badge tone={c.origin === "ai" ? "accent" : "neutral"}>{ORIGIN_LABEL[c.origin]}</Badge>
        <Badge tone={c.status === "approved" ? "success" : c.status === "rejected" ? "danger" : "neutral"}>
          {c.status}
        </Badge>
        <span className="text-sm text-muted">
          {c.department} · v{c.version} · {c.approvals}/{c.required_approvals} approvals
        </span>
      </div>

      {published && (
        <Alert tone="success">Approved and published to the question bank as Q{published.qid}.</Alert>
      )}
      {actionError && <Alert>{actionError}</Alert>}
      {c.status === "rejected" && c.rejection_reason && (
        <Alert tone="warning">Rejected: {c.rejection_reason}</Alert>
      )}
      {c.status === "pending" && blocking && (
        <Alert>This question cannot be approved until the failed checks are fixed. Edit it, or reject it.</Alert>
      )}
      {c.status === "pending" && mine && !allowSelf && (
        <Alert tone="warning">You wrote this question — another doctor needs to approve it.</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={editing ? "Editing the question" : "The question"}
              description={editing ? "Saving creates a new version and clears existing approvals." : undefined}
              actions={
                c.status === "pending" &&
                (editing ? (
                  <div className="flex gap-2">
                    <Button size="sm" loading={save.isPending}
                      onClick={() => {
                        const found = validateQuestion(draft!);
                        if (draft!.question_text.trim().length < 60) {
                          found.push("The vignette must be at least 60 characters");
                        }
                        setEditErrors(found);
                        if (found.length === 0) save.mutate();
                      }}>
                      Save changes
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(null); setEditErrors([]); }}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { setDraft(toDraft(c)); setEditing(true); }}>
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                ))
              }
            />
            <CardBody>
              {editing && draft ? (
                <div className="space-y-3">
                  {editErrors.length > 0 && (
                    <Alert>
                      <ul className="list-disc pl-5">
                        {editErrors.map((e) => <li key={e}>{e}</li>)}
                      </ul>
                    </Alert>
                  )}
                  <QuestionForm draft={draft} onChange={setDraft} meta={meta} idPrefix="edit" />
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="whitespace-pre-wrap leading-relaxed">{c.question_text}</p>
                  <ol className="space-y-2">
                    {c.options.map((o) => (
                      <li key={o.letter}
                        className={`rounded-lg border p-3 ${o.is_correct ? "border-accent-green/50 bg-accent-green/5" : "border-border"}`}>
                        <p className="font-medium">
                          <span className="font-mono">{o.letter}.</span> {o.text}
                          {o.is_correct && <span className="ml-2 text-xs text-accent-green">Correct</span>}
                        </p>
                        <p className="mt-1 text-sm text-muted">{o.explanation}</p>
                      </li>
                    ))}
                  </ol>
                  <div>
                    <p className="text-sm font-medium">Explanation</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">{c.explanation}</p>
                  </div>
                  {c.learning_point && (
                    <div>
                      <p className="text-sm font-medium">Learning point</p>
                      <p className="mt-1 text-sm text-muted">{c.learning_point}</p>
                    </div>
                  )}
                  <p className="text-sm text-muted">
                    Source: {c.source_code ?? "none given"}{c.reference ? ` · ${c.reference}` : ""}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {c.status === "pending" && (
            <Card>
              <CardHeader title="Your decision" />
              <CardBody className="space-y-3">
                <Field label="Notes" htmlFor="notes" hint="Optional — recorded against your review.">
                  <Textarea id="notes" rows={2} value={notes} maxLength={2000}
                    onChange={(e) => setNotes(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" loading={approve.isPending}
                    disabled={editing || blocking || (mine && !allowSelf)}
                    onClick={() => approve.mutate()}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                  <Button variant="danger" disabled={editing} onClick={() => setRejecting(true)}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
                <p className="text-xs text-muted">
                  {c.required_approvals > 1
                    ? `${c.required_approvals} approvals publish this question to students.`
                    : "Approving publishes this question to students."}
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Checks" />
            <CardBody>
              {c.check_details.length === 0 ? (
                <p className="text-sm text-muted">No checks recorded.</p>
              ) : (
                <CheckList checks={c.check_details} />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody className="space-y-3 text-sm">
              <p className="text-muted">
                {ORIGIN_LABEL[c.origin]}
                {c.created_by_name ? ` by ${c.created_by_name}` : ""} · {formatDate(c.created_at)}
                {c.brief_id && (
                  <> · <Link to={`/generate/${c.brief_id}`} className="underline">{c.brief_title ?? "request"}</Link></>
                )}
              </p>
              {c.reviews.length === 0 ? (
                <p className="text-muted">No reviews yet.</p>
              ) : (
                <ul className="space-y-2">
                  {c.reviews.map((r) => (
                    <li key={r.id} className="border-l-2 border-border pl-3">
                      <p>
                        <span className="font-medium">{r.reviewer_name ?? "A doctor"}</span>{" "}
                        <span className={r.decision === "approve" ? "text-accent-green" : r.decision === "reject" ? "text-danger" : "text-muted"}>
                          {r.decision === "edit" ? "edited" : `${r.decision}d`}
                        </span>{" "}
                        <span className="text-muted">v{r.candidate_version} · {formatDate(r.created_at)}</span>
                      </p>
                      {r.notes && <p className="text-muted">{r.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal open={rejecting} onClose={() => setRejecting(false)} title="Reject this question">
        <div className="space-y-3">
          <Field label="Why is it being rejected?" htmlFor="reason"
            hint="At least 5 characters. This is kept with the question so the author can learn from it.">
            <Textarea id="reason" rows={4} value={reason} maxLength={1000}
              onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button variant="danger" disabled={reason.trim().length < 5} loading={reject.isPending}
              onClick={() => reject.mutate()}>
              Reject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
