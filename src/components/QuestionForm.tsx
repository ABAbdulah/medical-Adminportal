import { z } from "zod";
import type { CandidateOption, Difficulty, Meta, QuestionType } from "../lib/types";
import { DIFFICULTY_LABEL, LETTERS, QUESTION_TYPE_LABEL } from "../lib/types";
import { Field, Input, Select, Textarea } from "./ui";

export interface QuestionDraft {
  topic: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  question_text: string;
  options: CandidateOption[];
  explanation: string;
  learning_point: string;
  source_code: string;
  reference: string;
}

export const questionSchema = z
  .object({
    topic: z.string().trim().min(2, "Give the question a topic").max(255),
    question_text: z.string().trim().min(1, "The clinical vignette is required").max(8000),
    explanation: z.string().trim().min(1, "An explanation is required").max(16000),
    learning_point: z.string().max(4000),
    source_code: z.string().regex(/^P[1-5]\.\d{1,2}$/, "Choose the guideline source"),
    reference: z.string().max(500),
    options: z
      .array(
        z.object({
          text: z.string().trim().min(1, "Every option needs text").max(2000),
          explanation: z.string().trim().min(1, "Every option needs a rationale").max(2000),
          is_correct: z.boolean(),
        }),
      )
      .length(5),
  })
  .refine((v) => v.options.filter((o) => o.is_correct).length === 1, {
    message: "Mark exactly one option as correct",
    path: ["options"],
  });

/** Validate a draft; returns de-duplicated, human-readable messages. */
export function validateQuestion(draft: QuestionDraft): string[] {
  const parsed = questionSchema.safeParse(draft);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => i.message).filter((m, i, all) => all.indexOf(m) === i);
}

/**
 * The question editor. Shared by "Write" and the edit mode in Review so a
 * doctor sees exactly the same fields and rules in both places.
 */
export function QuestionForm({
  draft,
  onChange,
  meta,
  idPrefix = "q",
}: {
  draft: QuestionDraft;
  onChange: (draft: QuestionDraft) => void;
  meta?: Meta;
  idPrefix?: string;
}) {
  const set = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const setOption = (index: number, patch: Partial<CandidateOption>) =>
    onChange({
      ...draft,
      options: draft.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Topic" htmlFor={`${idPrefix}-topic`} className="sm:col-span-2">
          <Input id={`${idPrefix}-topic`} value={draft.topic} maxLength={255}
            placeholder="e.g. Atrial fibrillation" onChange={(e) => set("topic", e.target.value)} />
        </Field>
        <Field label="Style" htmlFor={`${idPrefix}-type`}>
          <Select id={`${idPrefix}-type`} value={draft.question_type}
            onChange={(e) => set("question_type", e.target.value as QuestionType)}>
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
              <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
            ))}
          </Select>
        </Field>
        <Field label="Difficulty" htmlFor={`${idPrefix}-diff`}>
          <Select id={`${idPrefix}-diff`} value={draft.difficulty}
            onChange={(e) => set("difficulty", e.target.value as Difficulty)}>
            {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
              <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Clinical vignette and lead-in" htmlFor={`${idPrefix}-stem`}
        hint="Age, sex, setting, history, examination and results, ending with a clear question.">
        <Textarea id={`${idPrefix}-stem`} rows={6} value={draft.question_text} maxLength={8000}
          onChange={(e) => set("question_text", e.target.value)} />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Options — select the correct one</legend>
        {draft.options.map((option, index) => (
          <div key={option.letter}
            className={`space-y-2 rounded-lg border p-3 ${option.is_correct ? "border-accent-green/50 bg-accent-green/5" : "border-border"}`}>
            <div className="flex items-center gap-2">
              <input type="radio" name={`${idPrefix}-correct`} id={`${idPrefix}-correct-${option.letter}`}
                checked={option.is_correct} className="h-4 w-4 accent-[rgb(var(--c-accent-green))]"
                onChange={() =>
                  onChange({
                    ...draft,
                    options: draft.options.map((o, i) => ({ ...o, is_correct: i === index })),
                  })
                } />
              <label htmlFor={`${idPrefix}-correct-${option.letter}`} className="font-mono text-sm font-semibold">
                {option.letter}
              </label>
              <Input aria-label={`Option ${option.letter} text`} value={option.text} maxLength={2000}
                placeholder={`Option ${option.letter}`} onChange={(e) => setOption(index, { text: e.target.value })} />
            </div>
            <Textarea aria-label={`Option ${option.letter} rationale`} rows={2} value={option.explanation}
              maxLength={2000} placeholder={option.is_correct ? "Why this is correct" : "Why this is wrong"}
              onChange={(e) => setOption(index, { explanation: e.target.value })} />
          </div>
        ))}
      </fieldset>

      <Field label="Explanation" htmlFor={`${idPrefix}-expl`}
        hint="Shown after the student answers: why the key is right and what the teaching point is.">
        <Textarea id={`${idPrefix}-expl`} rows={5} value={draft.explanation} maxLength={16000}
          onChange={(e) => set("explanation", e.target.value)} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Learning point" htmlFor={`${idPrefix}-lp`} hint="One sentence.">
          <Textarea id={`${idPrefix}-lp`} rows={2} value={draft.learning_point} maxLength={4000}
            onChange={(e) => set("learning_point", e.target.value)} />
        </Field>
        <div className="space-y-3">
          <Field label="Guideline source" htmlFor={`${idPrefix}-source`}>
            <Select id={`${idPrefix}-source`} value={draft.source_code}
              onChange={(e) => set("source_code", e.target.value)}>
              <option value="">Choose a source…</option>
              {(meta?.sources ?? []).map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} · {s.abbreviation} (tier {s.tier})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" htmlFor={`${idPrefix}-ref`} hint="Chapter or guideline name.">
            <Input id={`${idPrefix}-ref`} value={draft.reference} maxLength={500}
              onChange={(e) => set("reference", e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  );
}

export function draftToPayload(draft: QuestionDraft) {
  return {
    topic: draft.topic.trim(),
    question_type: draft.question_type,
    difficulty: draft.difficulty,
    question_text: draft.question_text.trim(),
    options: draft.options.map((o, i) => ({
      letter: LETTERS[i],
      text: o.text.trim(),
      is_correct: o.is_correct,
      explanation: o.explanation.trim(),
    })),
    explanation: draft.explanation.trim(),
    learning_point: draft.learning_point.trim() || null,
    source_code: draft.source_code || null,
    reference: draft.reference.trim() || null,
  };
}
