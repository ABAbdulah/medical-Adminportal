import { useState } from "react";
import { z } from "zod";
import { api } from "../lib/api";
import type { BankQuestion } from "../lib/admin-types";
import { DIFFICULTY_LABEL, LETTERS, QUESTION_TYPE_LABEL } from "../lib/types";
import type { Difficulty, Letter, QuestionType } from "../lib/types";
import { DepartmentPicker } from "./DepartmentPicker";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "./ui";

/*
 * Editor for a question that is already in the student bank. Unlike the doctor
 * draft editor it tolerates older rows (fewer than five options, no per-option
 * rationale, free-text reference) — but it always sends the department and the
 * question type back, so saving never drops a question out of its
 * sub-department or re-guesses its type. The server derives the legacy
 * `subject` from the department.
 */

const schema = z.object({
  department_id: z.number({ invalid_type_error: "Choose a department" }).int().positive(),
  topic: z.string().trim().min(1, "Topic is required").max(255),
  question_text: z.string().trim().min(10, "The stem must be at least 10 characters").max(8000),
  explanation: z.string().trim().min(1, "An explanation is required").max(16000),
  learning_point: z.string().trim().max(4000),
  reference_source: z.string().trim().max(500),
});

type OptionDraft = { text: string; explanation: string };

function initialOptions(q: BankQuestion | null): Record<Letter, OptionDraft> {
  const out = Object.fromEntries(LETTERS.map((l) => [l, { text: "", explanation: "" }])) as Record<Letter, OptionDraft>;
  for (const o of q?.options ?? []) {
    if ((LETTERS as readonly string[]).includes(o.letter)) {
      out[o.letter as Letter] = { text: o.text, explanation: o.explanation ?? "" };
    }
  }
  return out;
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
  const [difficulty, setDifficulty] = useState<Difficulty>(
    (["easy", "medium", "hard"] as const).find((d) => d === question?.difficulty) ?? "medium",
  );
  const [questionType, setQuestionType] = useState<QuestionType | "">(question?.question_type ?? "");
  const [stem, setStem] = useState(question?.question_text ?? "");
  const [options, setOptions] = useState(() => initialOptions(question));
  const [correct, setCorrect] = useState<Letter>(() => {
    const c = question?.options.find((o) => o.is_correct)?.letter;
    return (LETTERS as readonly string[]).includes(c ?? "") ? (c as Letter) : "A";
  });
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [learningPoint, setLearningPoint] = useState(question?.learning_point ?? "");
  const [reference, setReference] = useState(question?.reference_source ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    const parsed = schema.safeParse({
      department_id: departmentId,
      topic,
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
    setErrors(problems.filter((m, i, all) => all.indexOf(m) === i));
    if (problems.length || !parsed.success) return;

    const body = {
      department_id: parsed.data.department_id,
      topic: parsed.data.topic,
      difficulty,
      question_type: questionType || null,
      question_text: parsed.data.question_text,
      explanation: parsed.data.explanation,
      learning_point: parsed.data.learning_point || null,
      reference_source: parsed.data.reference_source || null,
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

  return (
    <Modal open={open} onClose={onClose} size="lg"
      title={question ? `Edit question #${question.qid ?? question.id}` : "New question"}>
      <div className="space-y-4">
        <DepartmentPicker value={departmentId} onChange={setDepartmentId} disabled={saving} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Topic" htmlFor="bq-topic" className="sm:col-span-3">
            <Input id="bq-topic" value={topic} maxLength={255} placeholder="e.g. Asthma in children"
              onChange={(e) => setTopic(e.target.value)} />
          </Field>
          <Field label="Difficulty" htmlFor="bq-difficulty">
            <Select id="bq-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
              ))}
            </Select>
          </Field>
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

        <Field label="Explanation" htmlFor="bq-explanation">
          <Textarea id="bq-explanation" rows={4} value={explanation} maxLength={16000}
            onChange={(e) => setExplanation(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Learning point (optional)" htmlFor="bq-learning">
            <Input id="bq-learning" value={learningPoint} maxLength={4000}
              onChange={(e) => setLearningPoint(e.target.value)} />
          </Field>
          <Field label="Reference (optional)" htmlFor="bq-reference">
            <Input id="bq-reference" value={reference} maxLength={500} placeholder="e.g. eTG Cardiovascular 2024"
              onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

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
