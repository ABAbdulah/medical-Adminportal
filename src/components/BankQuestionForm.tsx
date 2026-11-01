import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { CheckCircle2, ExternalLink, Link2, Plus, Trash2, XCircle } from "lucide-react";
import { api, API_URL } from "../lib/api";
import type { BankQuestion, BankReference, BankTopic, BankTopicReview } from "../lib/admin-types";
import { DIFFICULTY_LABEL, LETTERS, QUESTION_TYPE_LABEL } from "../lib/types";
import type { Difficulty, Letter, QuestionType } from "../lib/types";
import { DepartmentPicker, useDepartments } from "./DepartmentPicker";
import { QuestionImagesEditor } from "./QuestionImagesEditor";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "./ui";

/*
 * Editor for a question that is already in the student bank. Unlike the doctor
 * draft editor it tolerates older rows (fewer than five options, no per-option
 * rationale, free-text reference) — but it always sends the department and the
 * question type back, so saving never drops a question out of its
 * sub-department or re-guesses its type. The server derives the legacy
 * `subject` from the department.
 *
 * 2026-10 (gynaecology bank): also edits the index title, the index topic, the
 * structured references (logo chips for students) and the full topic review.
 * Difficulty stays here and only here — students never see it.
 */

const schema = z.object({
  department_id: z.number({ invalid_type_error: "Choose a department" }).int().positive(),
  topic: z.string().trim().min(1, "Topic is required").max(255),
  title: z.string().trim().max(200, "Keep the title under 200 characters"),
  question_text: z.string().trim().min(10, "The stem must be at least 10 characters").max(8000),
  explanation: z.string().trim().min(1, "An explanation is required").max(16000),
  learning_point: z.string().trim().max(4000),
  reference_source: z.string().trim().max(500),
});

const referenceSchema = z.object({
  label: z.string().trim().min(1, "Every reference needs a source name").max(200),
  url: z.string().trim().regex(/^https?:\/\/\S+$/, "Reference links must start with http:// or https://").max(1000),
});

type OptionDraft = { text: string; explanation: string };
type RefDraft = BankReference & { key: string; checking?: boolean; checked?: number | null };

function initialOptions(q: BankQuestion | null): Record<Letter, OptionDraft> {
  const out = Object.fromEntries(LETTERS.map((l) => [l, { text: "", explanation: "" }])) as Record<Letter, OptionDraft>;
  for (const o of q?.options ?? []) {
    if ((LETTERS as readonly string[]).includes(o.letter)) {
      out[o.letter as Letter] = { text: o.text, explanation: o.explanation ?? "" };
    }
  }
  return out;
}

let refSeq = 0;
function draftRef(r?: Partial<BankReference>): RefDraft {
  return {
    key: `r${++refSeq}`,
    label: r?.label ?? "",
    url: r?.url ?? "",
    section: r?.section ?? "manual",
    inferred: r?.inferred ?? false,
    status_code: r?.status_code ?? null,
    checked: r?.status_code ?? null,
  };
}

/** "## Heading\nbody" blocks <-> {title, sections}. Plain text, never HTML. */
function reviewToText(review: BankTopicReview | null): string {
  if (!review) return "";
  return review.sections
    .map((s) => (s.heading ? `## ${s.heading}\n` : "") + s.body)
    .join("\n\n");
}

function textToReview(title: string, text: string): BankTopicReview | null {
  const trimmed = text.trim();
  if (!trimmed && !title.trim()) return null;
  const sections = trimmed
    ? trimmed
        .split(/\n(?=## )/)
        .map((block) => {
          const lines = block.trim().split("\n");
          if (lines[0]?.startsWith("## ")) {
            return { heading: lines[0].slice(3).trim(), body: lines.slice(1).join("\n").trim() };
          }
          return { heading: "", body: block.trim() };
        })
        .filter((s) => s.heading || s.body)
    : [];
  return { title: title.trim(), sections };
}

function sectionLabel(section: string): string {
  switch (section) {
    case "review":
    case "explanation":
    case "learning_point":
      return "Cited";
    case "related":
      return "Related (inferred)";
    case "mentioned":
      return "Named in text (link inferred)";
    default:
      return "Added by admin";
  }
}

export function BankQuestionForm({
  question,
  open,
  onClose,
  onSaved,
}: {
  /** Null creates a new question. Remount (key) per question so state resets. */
  question: BankQuestion | null;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [departmentId, setDepartmentId] = useState<number | null>(question?.department_id ?? null);
  const [topic, setTopic] = useState(question?.topic ?? "");
  const [title, setTitle] = useState(question?.title ?? "");
  const [topicId, setTopicId] = useState<number | null>(question?.topic_id ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    (["easy", "medium", "hard"] as const).find((d) => d === question?.difficulty) ?? "medium",
  );
  const [questionType, setQuestionType] = useState<QuestionType | "">(question?.question_type ?? "");
  const [freeSample, setFreeSample] = useState(question?.is_free_sample ?? false);
  const [stem, setStem] = useState(question?.question_text ?? "");
  const [options, setOptions] = useState(() => initialOptions(question));
  const [correct, setCorrect] = useState<Letter>(() => {
    const c = question?.options.find((o) => o.is_correct)?.letter;
    return (LETTERS as readonly string[]).includes(c ?? "") ? (c as Letter) : "A";
  });
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [learningPoint, setLearningPoint] = useState(question?.learning_point ?? "");
  const [reference, setReference] = useState(question?.reference_source ?? "");
  const [references, setReferences] = useState<RefDraft[]>(() => (question?.references ?? []).map(draftRef));
  const [reviewTitle, setReviewTitle] = useState(question?.topic_review?.title ?? "");
  const [reviewText, setReviewText] = useState(() => reviewToText(question?.topic_review ?? null));
  const [showReview, setShowReview] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Index topics: those of the chosen department, or of its parent (a topic on
  // "Medicine" is valid for a question filed under Cardiology).
  const { data: departments = [] } = useDepartments();
  const allowedDepartmentIds = useMemo(() => {
    const ids = new Set<number>();
    if (departmentId === null) return ids;
    ids.add(departmentId);
    for (const d of departments) {
      if (d.children.some((c) => c.id === departmentId)) ids.add(d.id);
    }
    return ids;
  }, [departmentId, departments]);
  const topicsQuery = useQuery({
    queryKey: ["admin", "question-topics"],
    queryFn: () => api.get<BankTopic[]>("/api/admin/question-topics"),
    enabled: open,
  });
  const topicOptions = (topicsQuery.data ?? []).filter((t) => allowedDepartmentIds.has(t.department_id));

  function updateRef(key: string, patch: Partial<RefDraft>) {
    setReferences((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function checkRef(r: RefDraft) {
    updateRef(r.key, { checking: true });
    try {
      const res = await api.post<{ status_code: number; ok: boolean }>("/api/admin/references/check", { url: r.url.trim() });
      updateRef(r.key, { checking: false, checked: res.status_code });
    } catch (e) {
      updateRef(r.key, { checking: false, checked: 0 });
      setErrors([e instanceof Error ? e.message : "Could not check the link"]);
    }
  }

  async function save() {
    const parsed = schema.safeParse({
      department_id: departmentId,
      topic,
      title,
      question_text: stem,
      explanation,
      learning_point: learningPoint,
      reference_source: reference,
    });
    const problems = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
    const filled = LETTERS.filter((l) => options[l].text.trim());
    if (filled.length < 2) problems.push("Give at least two options");
    if (!options[correct].text.trim()) problems.push(`Option ${correct} is marked correct but has no text`);
    if (LETTERS.some((l) => options[l].text.length > 2000 || options[l].explanation.length > 2000)) {
      problems.push("Options and their rationales must stay under 2,000 characters");
    }
    const cleanRefs: { label: string; url: string; section: string; inferred: boolean }[] = [];
    for (const r of references) {
      const pr = referenceSchema.safeParse({ label: r.label, url: r.url });
      if (!pr.success) {
        problems.push(...pr.error.issues.map((i) => i.message));
        continue;
      }
      cleanRefs.push({ label: pr.data.label, url: pr.data.url, section: r.section, inferred: r.inferred });
    }
    if (cleanRefs.length > 20) problems.push("Keep it to 20 references");
    if (topicId !== null && !topicOptions.some((t) => t.id === topicId)) {
      problems.push("The index topic must belong to the chosen department");
    }
    setErrors(problems.filter((m, i, all) => all.indexOf(m) === i));
    if (problems.length || !parsed.success) return;

    const body = {
      department_id: parsed.data.department_id,
      topic: parsed.data.topic,
      title: parsed.data.title || null,
      topic_id: topicId,
      difficulty,
      question_type: questionType || null,
      is_free_sample: freeSample,
      question_text: parsed.data.question_text,
      explanation: parsed.data.explanation,
      learning_point: parsed.data.learning_point || null,
      reference_source: parsed.data.reference_source || null,
      references: cleanRefs,
      topic_review: textToReview(reviewTitle, reviewText),
      options: filled.map((letter) => ({
        letter,
        text: options[letter].text.trim(),
        is_correct: letter === correct,
        explanation: options[letter].explanation.trim() || null,
      })),
    };

    setSaving(true);
    try {
      if (question) {
        await api.put(`/api/admin/questions/${question.id}`, body);
        onSaved("Question saved ✓");
      } else {
        await api.post("/api/admin/questions", body);
        // POST /api/admin/questions publishes straight away (model default).
        onSaved("Question created and published ✓");
      }
      onClose();
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Could not save the question"]);
    } finally {
      setSaving(false);
    }
  }

  const meta = question?.import_meta;

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={question ? `Edit question #${question.qid ?? question.id}` : "New question"}>
      <div className="space-y-4">
        {meta?.source && (
          <p className="rounded-md border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted">
            Imported from <span className="font-medium text-foreground">{meta.source}</span>
            {meta.number ? ` · question ${meta.number}` : ""}
            {meta.page ? ` · page ${meta.page}` : ""}
            {meta.style_tag ? ` · source tag ${meta.style_tag}${meta.difficulty_tag ? ` / ${meta.difficulty_tag}` : ""}` : ""}
          </p>
        )}
        <DepartmentPicker value={departmentId} onChange={(id) => { setDepartmentId(id); setTopicId(null); }} disabled={saving} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Subtopic (revealed after answering)" htmlFor="bq-topic" className="sm:col-span-3">
            <Input id="bq-topic" value={topic} maxLength={255} placeholder="e.g. Cervical screening"
              onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <Field label="Index title (optional, revealed after answering)" htmlFor="bq-title" className="sm:col-span-2"
            hint="Short and specific, e.g. “Self-collection + non-16/18 HPV”.">
            <Input id="bq-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Index topic" htmlFor="bq-index-topic"
            hint={departmentId === null ? "Choose a department first." : topicOptions.length === 0 ? "No topics for this department yet." : undefined}>
            <Select id="bq-index-topic" value={topicId ?? ""} disabled={topicOptions.length === 0}
              onChange={(e) => setTopicId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Not filed</option>
              {topicOptions.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Difficulty (admin only — students never see it)" htmlFor="bq-difficulty">
            <Select id="bq-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={freeSample} className="h-4 w-4 accent-[rgb(var(--c-accent))]"
              onChange={(e) => setFreeSample(e.target.checked)} />
            Free sample: free-trial students can open this question (they see nothing else)
          </label>
          <Field label="Question type" htmlFor="bq-type" className="sm:col-span-2"
            hint={questionType ? undefined : "Left blank, the server proposes one from the stem."}>
            <Select id="bq-type" value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType | "")}>
              <option value="">Let the server decide</option>
              {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Question stem" htmlFor="bq-stem">
          <Textarea id="bq-stem" rows={5} value={stem} maxLength={8000}
            placeholder="Clinical vignette and lead-in question…" onChange={(e) => setStem(e.target.value)} />
        </Field>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-medium">Options — select the correct answer</legend>
          {LETTERS.map((letter) => (
            <div key={letter} className="space-y-1.5 rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2">
                <input type="radio" name="bq-correct" checked={correct === letter}
                  onChange={() => setCorrect(letter)} aria-label={`Mark option ${letter} correct`}
                  className="h-4 w-4 shrink-0 accent-[rgb(var(--c-accent))]" />
                <span className="w-4 shrink-0 text-sm font-semibold text-muted">{letter}</span>
                <Input value={options[letter].text} maxLength={2000}
                  placeholder={`Option ${letter}${letter === "E" ? " (optional)" : ""}`}
                  aria-label={`Option ${letter}`}
                  onChange={(e) => setOptions((o) => ({ ...o, [letter]: { ...o[letter], text: e.target.value } }))} />
              </div>
              <Input className="h-8 text-xs" value={options[letter].explanation} maxLength={2000}
                placeholder="Why this option is right or wrong (optional)"
                aria-label={`Rationale for option ${letter}`}
                onChange={(e) => setOptions((o) => ({ ...o, [letter]: { ...o[letter], explanation: e.target.value } }))} />
            </div>
          ))}
        </fieldset>

        <Field label="Explanation" htmlFor="bq-explanation"
          hint="[[ref:N]] in the text renders reference N as an inline logo chip for students.">
          <Textarea id="bq-explanation" rows={4} value={explanation} maxLength={16000}
            onChange={(e) => setExplanation(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Learning point (optional)" htmlFor="bq-learning">
            <Input id="bq-learning" value={learningPoint} maxLength={4000}
              onChange={(e) => setLearningPoint(e.target.value)} />
          </Field>
          <Field label="Legacy reference text (optional)" htmlFor="bq-reference"
            hint="Shown only when there are no reference links below.">
            <Input id="bq-reference" value={reference} maxLength={500} placeholder="e.g. eTG Cardiovascular 2024"
              onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        {/* ---- reference links -------------------------------------------- */}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">
            Reference links{" "}
            <span className="font-normal text-muted">— students see each as a chip with the site’s logo</span>
          </legend>
          {references.length === 0 && (
            <p className="text-xs text-muted">No links yet. Add the guideline pages this question rests on.</p>
          )}
          {references.map((r, i) => (
            <div key={r.key} className="space-y-1.5 rounded-md border border-border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-5 shrink-0 text-xs font-semibold text-muted">{i + 1}</span>
                {r.url && /^https?:\/\//.test(r.url) ? (
                  <img src={`${API_URL}/api/references/logo/${encodeURIComponent(domainOf(r.url))}`}
                    width={16} height={16} alt="" className="h-4 w-4 rounded-sm bg-surface-2"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                ) : (
                  <Link2 className="h-4 w-4 text-muted" aria-hidden />
                )}
                <Input className="h-8 min-w-[10rem] flex-1 text-xs" value={r.label} maxLength={200}
                  placeholder="Source name, e.g. Cancer Council Australia" aria-label={`Reference ${i + 1} source name`}
                  onChange={(e) => updateRef(r.key, { label: e.target.value })} />
                <Select className="h-8 w-44 text-xs" value={r.inferred ? "related" : "cited"}
                  aria-label={`Reference ${i + 1} kind`}
                  onChange={(e) => updateRef(r.key, { inferred: e.target.value === "related", section: e.target.value === "related" ? "related" : r.section === "related" || r.section === "mentioned" ? "manual" : r.section })}>
                  <option value="cited">Cited source</option>
                  <option value="related">Related guideline</option>
                </Select>
                <Button variant="ghost" size="icon" className="text-danger hover:text-danger"
                  aria-label={`Remove reference ${i + 1}`}
                  onClick={() => setReferences((rs) => rs.filter((x) => x.key !== r.key))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Input className="h-8 flex-1 text-xs" value={r.url} maxLength={1000} placeholder="https://…"
                  aria-label={`Reference ${i + 1} link`} onChange={(e) => updateRef(r.key, { url: e.target.value, checked: null })} />
                <Button variant="outline" size="sm" loading={r.checking} disabled={!/^https?:\/\//.test(r.url)}
                  onClick={() => void checkRef(r)}>Check</Button>
                {r.checked !== null && r.checked !== undefined && (
                  <span className="inline-flex items-center gap-1 text-xs" title={`HTTP ${r.checked}`}>
                    {r.checked >= 200 && r.checked < 400
                      ? <><CheckCircle2 className="h-3.5 w-3.5 text-accent" /> {r.checked}</>
                      : <><XCircle className="h-3.5 w-3.5 text-danger" /> {r.checked === 0 ? "unreachable" : r.checked}</>}
                  </span>
                )}
                {/^https?:\/\//.test(r.url) && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open link in a new tab"
                    className="text-muted hover:text-accent"><ExternalLink className="h-4 w-4" /></a>
                )}
              </div>
              <p className="text-[11px] text-muted">{sectionLabel(r.section)}</p>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setReferences((rs) => [...rs, draftRef()])}
            disabled={references.length >= 20}>
            <Plus className="h-3.5 w-3.5" /> Add reference
          </Button>
        </fieldset>

        {/* ---- topic review ---------------------------------------------- */}
        <fieldset className="space-y-2">
          <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium">
            <span>
              Complete topic review{" "}
              <span className="font-normal text-muted">
                — {question?.topic_review?.sections.length ?? 0} section{(question?.topic_review?.sections.length ?? 0) === 1 ? "" : "s"}, shown to students after answering
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowReview((s) => !s)}>
              {showReview ? "Hide" : "Edit"}
            </Button>
          </legend>
          {showReview && (
            <>
              <Field label="Review title" htmlFor="bq-review-title">
                <Input id="bq-review-title" value={reviewTitle} maxLength={255} placeholder="e.g. Cervical screening"
                  onChange={(e) => setReviewTitle(e.target.value)} />
              </Field>
              <Field label="Sections" htmlFor="bq-review"
                hint="Start each section with “## Heading” on its own line. Lines starting with “• ” become bullets. Plain text only.">
                <Textarea id="bq-review" rows={12} value={reviewText} className="font-mono text-xs"
                  onChange={(e) => setReviewText(e.target.value)} />
              </Field>
            </>
          )}
        </fieldset>

        {/* ---- pictures (saved on their own, so only for an existing question) ---- */}
        {question?.id ? (
          <QuestionImagesEditor questionId={question.id} />
        ) : (
          <p className="text-xs text-muted">Pictures can be added after the question is created.</p>
        )}

        {errors.length > 0 && (
          <Alert>
            <ul className="list-disc space-y-0.5 pl-4">
              {errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </Alert>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={saving} onClick={() => void save()}>
            {question ? "Save changes" : "Create question"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
