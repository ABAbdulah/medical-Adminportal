import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { api, ApiError, downloadWithAuth } from "../lib/api";
import type { Difficulty, ImportPreview, ImportRow, Meta, QuestionType } from "../lib/types";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL } from "../lib/types";
import { DepartmentPicker } from "../components/DepartmentPicker";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CheckList, CheckSummary, Field, Input, Select,
} from "../components/ui";

function RowCard({
  row,
  keep,
  onToggle,
}: {
  row: ImportRow;
  keep: boolean;
  onToggle: () => void;
}) {
  const [open, setOpen] = useState(false);
  const valid = row.item !== null;
  const fail = row.checks.filter((c) => c.level === "fail").length;
  const warn = row.checks.filter((c) => c.level === "warn").length;
  const item = row.item as Record<string, string> | null;

  return (
    <li className="border-b border-border/60 last:border-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <input type="checkbox" checked={keep} disabled={!valid} onChange={onToggle}
          aria-label={`Include row ${row.index}`} className="mt-1 h-4 w-4 accent-[rgb(var(--c-accent))]" />
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted">#{row.index}</span>
            <span className="font-medium">{row.label || "(untitled)"}</span>
            {valid ? <CheckSummary fail={fail} warn={warn} /> : <Badge tone="danger">Cannot import</Badge>}
          </span>
          {item && (
            <span className="mt-0.5 block truncate text-sm text-muted">
              {String(item.question_text ?? "")}
            </span>
          )}
        </button>
        <span className="mt-0.5 text-muted">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
      </div>
      {open && (
        <div className="space-y-3 border-t border-border/60 bg-surface-2/40 px-4 py-3 text-sm">
          {row.errors.length > 0 && (
            <div>
              <p className="font-medium text-danger">Problems with this row</p>
              <ul className="mt-1 list-disc pl-5 text-danger">
                {row.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {item && (
            <>
              <p className="whitespace-pre-wrap">{String(item.question_text ?? "")}</p>
              <ol className="space-y-1">
                {((row.item?.options ?? []) as { letter: string; text: string; is_correct: boolean }[]).map((o) => (
                  <li key={o.letter} className={o.is_correct ? "font-medium text-accent-green" : undefined}>
                    {o.letter}. {o.text}
                  </li>
                ))}
              </ol>
            </>
          )}
          {row.checks.length > 0 && <CheckList checks={row.checks} />}
        </div>
      )}
    </li>
  );
}

export function Import() {
  const queryClient = useQueryClient();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/clinician/meta") });
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [batchLabel, setBatchLabel] = useState("");
  const [topic, setTopic] = useState("");
  const [questionType, setQuestionType] = useState<QuestionType>("management");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [committed, setCommitted] = useState<{ created_count: number; failed_count: number } | null>(null);

  const maxRows = Number(meta?.settings?.["import.max_rows"] ?? 500);

  const runPreview = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("file", file!);
      form.append("topic", topic);
      form.append("question_type", questionType);
      form.append("difficulty", difficulty);
      return api.upload<ImportPreview>("/api/clinician/import/preview", form);
    },
    onSuccess: (data) => {
      setPreview(data);
      setSkipped(new Set());
      setCommitted(null);
      if (!batchLabel.trim()) setBatchLabel(data.filename || "Imported file");
    },
  });

  const keptRows = useMemo(
    () => (preview?.rows ?? []).filter((r) => r.item && !skipped.has(r.index)),
    [preview, skipped],
  );

  const commit = useMutation({
    mutationFn: () =>
      api.post<{ created_count: number; failed_count: number }>("/api/clinician/import/commit", {
        department_id: departmentId,
        batch_label: batchLabel.trim() || "Imported file",
        items: keptRows.map((r) => r.item),
      }),
    onSuccess: (res) => {
      setCommitted(res);
      setPreview(null);
      setFile(null);
      setSkipped(new Set());
      if (fileInput.current) fileInput.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Import questions from a file</h1>
          <p className="text-sm text-muted">
            CSV or JSON, up to {maxRows} questions and 5 MB. Nothing is saved until you confirm the preview.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"
            onClick={() => downloadWithAuth("/api/clinician/import/template?fmt=csv", "mcq-import-template.csv")}>
            <Download className="h-4 w-4" /> CSV template
          </Button>
          <Button variant="outline" size="sm"
            onClick={() => downloadWithAuth("/api/clinician/import/template?fmt=json", "mcq-import-template.json")}>
            <Download className="h-4 w-4" /> JSON template
          </Button>
        </div>
      </div>

      {committed && (
        <Alert tone="success">
          Imported {committed.created_count} question{committed.created_count === 1 ? "" : "s"} into the review queue
          {committed.failed_count > 0 && `; ${committed.failed_count} could not be saved`}.
        </Alert>
      )}
      {runPreview.error && <Alert>{(runPreview.error as ApiError).message}</Alert>}
      {commit.error && <Alert>{(commit.error as ApiError).message}</Alert>}

      <Card>
        <CardHeader title="1 · Choose the file and where it belongs" />
        <CardBody className="space-y-3">
          <DepartmentPicker value={departmentId} onChange={setDepartmentId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="File" htmlFor="file" hint="Columns can be named loosely — the importer maps common spellings.">
              <input ref={fileInput} id="file" type="file" accept=".csv,.json,text/csv,application/json"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }}
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm" />
            </Field>
            <Field label="Batch label" htmlFor="import-batch" hint="Groups these questions in the review queue.">
              <Input id="import-batch" value={batchLabel} maxLength={120}
                onChange={(e) => setBatchLabel(e.target.value)} />
            </Field>
          </div>

          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-medium">Defaults for rows that leave a column blank</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Topic" htmlFor="import-topic">
                <Input id="import-topic" value={topic} maxLength={255} placeholder="e.g. Heart failure"
                  onChange={(e) => setTopic(e.target.value)} />
              </Field>
              <Field label="Style" htmlFor="import-type">
                <Select id="import-type" value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}>
                  {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                    <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Difficulty" htmlFor="import-diff">
                <Select id="import-diff" value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                  {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                    <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </fieldset>

          <Button disabled={!file} loading={runPreview.isPending} onClick={() => runPreview.mutate()}>
            Preview the file
          </Button>
        </CardBody>
      </Card>

      {preview && (
        <Card>
          <CardHeader
            title={`2 · Check ${preview.total} row${preview.total === 1 ? "" : "s"}`}
            description={`${preview.valid} can be imported · ${preview.invalid} cannot`}
            actions={
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSkipped(new Set())}>Select all</Button>
                <Button variant="ghost" size="sm"
                  onClick={() => setSkipped(new Set((preview.rows ?? []).map((r) => r.index)))}>
                  Select none
                </Button>
              </div>
            }
          />
          <CardBody className="p-0">
            <ul>
              {preview.rows.map((row) => (
                <RowCard key={row.index} row={row} keep={!skipped.has(row.index)}
                  onToggle={() =>
                    setSkipped((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.index)) next.delete(row.index);
                      else next.add(row.index);
                      return next;
                    })
                  } />
              ))}
            </ul>
          </CardBody>
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
            <Button disabled={!departmentId || keptRows.length === 0} loading={commit.isPending}
              onClick={() => commit.mutate()}>
              Import {keptRows.length} question{keptRows.length === 1 ? "" : "s"}
            </Button>
            {!departmentId && <span className="text-sm text-danger">Choose a department first.</span>}
            <span className="text-sm text-muted">They will wait for approval like any other question.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
