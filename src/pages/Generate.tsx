import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Brief, Difficulty, Meta, Paged, QuestionType } from "../lib/types";
import { BRIEF_STATUS_LABEL, DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, formatDate } from "../lib/types";
import { DepartmentPicker } from "../components/DepartmentPicker";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Spinner, Textarea,
} from "../components/ui";

const STATUS_TONE = {
  draft: "neutral", planning: "accent", generating: "accent", ready: "success", failed: "danger",
} as const;

export function Generate() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/clinician/meta") });
  const briefs = useQuery({
    queryKey: ["briefs"],
    queryFn: () => api.get<Paged<Brief>>("/api/clinician/briefs?page_size=50"),
    // A generating brief advances server-side; poll only while one is running.
    refetchInterval: (query) =>
      (query.state.data?.items ?? []).some((b) => b.status === "planning" || b.status === "generating") ? 5000 : false,
  });

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [topic, setTopic] = useState("");
  const [targetCount, setTargetCount] = useState(20);
  const [types, setTypes] = useState<QuestionType[]>(["basic", "investigation", "management"]);
  const [mix, setMix] = useState<Record<Difficulty, number>>({ easy: 30, medium: 50, hard: 20 });
  const [instructions, setInstructions] = useState("");
  const [examples, setExamples] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const maxTarget = meta?.limits.max_target_per_request ?? 100;
  const remaining = Math.max(0, (meta?.limits.daily_generation_cap ?? 0) - (meta?.limits.generated_today ?? 0));

  const create = useMutation({
    mutationFn: () =>
      api.post<Brief>("/api/clinician/briefs", {
        title: title.trim(),
        department_id: departmentId,
        topic: topic.trim(),
        target_count: targetCount,
        question_types: types,
        difficulty_mix: mix,
        instructions: instructions.trim(),
        example_mcqs: examples.trim(),
      }),
    onSuccess: (brief) => {
      queryClient.invalidateQueries({ queryKey: ["briefs"] });
      navigate(`/generate/${brief.id}`);
    },
  });

  function submit() {
    if (title.trim().length < 3) return setFormError("Give the request a title of at least 3 characters");
    if (!departmentId) return setFormError("Choose a department");
    if (topic.trim().length < 2) return setFormError("Enter the topic to write about");
    if (types.length === 0) return setFormError("Choose at least one question style");
    if (Object.values(mix).reduce((a, b) => a + b, 0) <= 0) return setFormError("Give at least one difficulty a weight");
    setFormError(null);
    create.mutate();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Generate with AI</h1>
          <p className="text-sm text-muted">
            Describe what you want, attach examples or images, and review every question before it is published.
            {meta && ` You can generate ${remaining} more today.`}
          </p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "New request"}</Button>
      </div>

      {create.error && <Alert>{(create.error as ApiError).message}</Alert>}
      {formError && <Alert>{formError}</Alert>}

      {showForm && (
        <Card>
          <CardHeader title="Tell the AI what to write" />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" htmlFor="brief-title" hint="How this request appears in the list.">
                <Input id="brief-title" value={title} maxLength={200} placeholder="e.g. AF management, 20 questions"
                  onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Topic" htmlFor="brief-topic" hint="The clinical subject every question should cover.">
                <Input id="brief-topic" value={topic} maxLength={255} placeholder="e.g. Atrial fibrillation"
                  onChange={(e) => setTopic(e.target.value)} />
              </Field>
            </div>

            <DepartmentPicker value={departmentId} onChange={setDepartmentId} />

            <Field label={`How many questions (1–${maxTarget})`} htmlFor="brief-count">
              <Input id="brief-count" type="number" min={1} max={maxTarget} value={targetCount}
                onChange={(e) => setTargetCount(Math.max(1, Math.min(maxTarget, Number(e.target.value) || 1)))} />
            </Field>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Question styles to include</legend>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => {
                  const on = types.includes(t);
                  return (
                    <button key={t} type="button"
                      onClick={() => setTypes((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}
                      aria-pressed={on}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-foreground"}`}>
                      {QUESTION_TYPE_LABEL[t]}
                    </button>
                  );
                })}
              </div>
              {meta && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {meta.question_types
                    .filter((q) => types.includes(q.value))
                    .map((q) => <li key={q.value}>{QUESTION_TYPE_LABEL[q.value]}: {q.description}</li>)}
                </ul>
              )}
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Difficulty mix</legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                  <Field key={d} label={DIFFICULTY_LABEL[d]} htmlFor={`mix-${d}`}>
                    <Input id={`mix-${d}`} type="number" min={0} max={100} value={mix[d]}
                      onChange={(e) =>
                        setMix((prev) => ({ ...prev, [d]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))
                      } />
                  </Field>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">Relative weights — they do not need to add to 100.</p>
            </fieldset>

            <Field label="Instructions" htmlFor="brief-instructions"
              hint="Anything the AI must follow: Australian guidelines, settings, populations, things to avoid.">
              <Textarea id="brief-instructions" rows={5} value={instructions} maxLength={8000}
                onChange={(e) => setInstructions(e.target.value)} />
            </Field>

            <Field label="Example questions" htmlFor="brief-examples"
              hint="Paste one or two questions in the style you want. Examples steer the AI far more than adjectives do.">
              <Textarea id="brief-examples" rows={6} value={examples} maxLength={16000}
                onChange={(e) => setExamples(e.target.value)} />
            </Field>

            <p className="text-sm text-muted">
              Images are attached on the next screen, once the request exists.
            </p>
            <Button loading={create.isPending} onClick={submit}>Create request</Button>
          </CardBody>
        </Card>
      )}

      {briefs.isLoading ? (
        <Spinner />
      ) : briefs.error ? (
        <Alert>{(briefs.error as Error).message}</Alert>
      ) : briefs.data!.items.length === 0 ? (
        <EmptyState title="No AI requests yet"
          description="Create a request to have the AI draft a batch of questions on one topic."
          action={<Button onClick={() => setShowForm(true)}>New request</Button>} />
      ) : (
        <Card>
          <CardHeader title={`Requests (${briefs.data!.total})`} />
          <CardBody className="p-0">
            <ul>
              {briefs.data!.items.map((b) => (
                <li key={b.id} className="border-b border-border/60 last:border-0">
                  <Link to={`/generate/${b.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-surface-2/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{b.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {b.topic} · {b.department} · {b.created_by_name ?? "Unknown"} · {formatDate(b.created_at)}
                      </span>
                    </span>
                    <Badge tone={STATUS_TONE[b.status]}>{BRIEF_STATUS_LABEL[b.status]}</Badge>
                    <span className="w-24 text-right text-sm text-muted">
                      {b.generated_count}/{b.target_count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
