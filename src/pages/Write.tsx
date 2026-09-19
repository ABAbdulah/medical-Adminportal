import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { CandidateDetail, Meta } from "../lib/types";
import { emptyOptions } from "../lib/types";
import { DepartmentPicker } from "../components/DepartmentPicker";
import { QuestionForm, draftToPayload, validateQuestion } from "../components/QuestionForm";
import type { QuestionDraft } from "../components/QuestionForm";
import { Alert, Button, Card, CardBody, CardHeader, CheckList, Field, Input } from "../components/ui";

function blankDraft(): QuestionDraft {
  return {
    topic: "",
    question_type: "management",
    difficulty: "medium",
    question_text: "",
    options: emptyOptions(),
    explanation: "",
    learning_point: "",
    source_code: "",
    reference: "",
  };
}

export function Write() {
  const queryClient = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/clinician/meta") });

  const [draft, setDraft] = useState<QuestionDraft>(blankDraft);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [batchLabel, setBatchLabel] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<CandidateDetail | null>(null);

  const save = useMutation({
    mutationFn: (keepTopic: boolean) =>
      api
        .post<CandidateDetail>("/api/clinician/candidates", {
          ...draftToPayload(draft),
          department_id: departmentId,
          batch_label: batchLabel.trim() || null,
        })
        .then((res) => ({ res, keepTopic })),
    onSuccess: ({ res, keepTopic }) => {
      setSaved(res);
      setErrors([]);
      // Doctors write in runs on one topic, so keep the scaffolding and clear
      // only what must differ between questions.
      setDraft(keepTopic ? { ...blankDraft(), topic: draft.topic, source_code: draft.source_code } : blankDraft());
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  function submit(keepTopic: boolean) {
    const found = validateQuestion(draft);
    if (!departmentId) found.unshift("Choose a department");
    setErrors(found);
    if (found.length === 0) save.mutate(keepTopic);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Write a question</h1>
        <p className="text-sm text-muted">
          Saved questions join the review queue — they are not shown to students until approved.
        </p>
      </div>

      {saved && (
        <Alert tone="success">
          Saved “{saved.topic}” to the review queue.{" "}
          <Link to={`/review/${saved.id}`} className="underline">Open it</Link>
          {saved.check_details.some((c) => c.level !== "pass") && " — it has check findings to look at."}
        </Alert>
      )}
      {save.error && <Alert>{(save.error as ApiError).message}</Alert>}
      {errors.length > 0 && (
        <Alert>
          <p className="font-medium">Fix these before saving:</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </Alert>
      )}

      <Card>
        <CardHeader title="Where it belongs" />
        <CardBody className="space-y-3">
          <DepartmentPicker value={departmentId} onChange={setDepartmentId} />
          <Field label="Batch label" htmlFor="batch"
            hint="Optional — groups a run of questions in the queue, e.g. “Cardiology sprint, week 2”.">
            <Input id="batch" value={batchLabel} maxLength={120} onChange={(e) => setBatchLabel(e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="The question" />
        <CardBody>
          <QuestionForm draft={draft} onChange={setDraft} meta={meta} idPrefix="write" />
        </CardBody>
      </Card>

      {saved && saved.check_details.length > 0 && (
        <Card>
          <CardHeader title="Checks on the question you just saved" />
          <CardBody>
            <CheckList checks={saved.check_details} />
          </CardBody>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button loading={save.isPending} onClick={() => submit(false)}>Save to review queue</Button>
        <Button variant="secondary" loading={save.isPending} onClick={() => submit(true)}>
          Save and write another on this topic
        </Button>
        <Button variant="ghost" onClick={() => { setDraft(blankDraft()); setErrors([]); setSaved(null); }}>
          Clear
        </Button>
      </div>
    </div>
  );
}
