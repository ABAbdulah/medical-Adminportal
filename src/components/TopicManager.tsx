import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import type { BankTopic } from "../lib/admin-types";
import { useDepartments } from "./DepartmentPicker";
import { Alert, Button, Field, Input, Modal, Select } from "./ui";

/*
 * Index topics (question_topics): the broad clusters the student index page
 * and the Topic filter are built from. Names must stay BROAD — a student sees
 * them before answering, so a name that gives the diagnosis away defeats the
 * point of hiding the subtopic.
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

type Draft = { name: string; slug: string; description: string; display_order: number };

export function TopicManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: departments = [] } = useDepartments();
  const flatDepartments = useMemo(
    () => departments.flatMap((d) => [{ id: d.id, label: d.name }, ...d.children.map((c) => ({ id: c.id, label: `${d.name} › ${c.name}` }))]),
    [departments],
  );
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [draft, setDraft] = useState<Draft>({ name: "", slug: "", description: "", display_order: 0 });
  const [editing, setEditing] = useState<BankTopic | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topics = useQuery({
    queryKey: ["admin", "question-topics", departmentId],
    queryFn: () => api.get<BankTopic[]>(`/api/admin/question-topics${departmentId ? `?department_id=${departmentId}` : ""}`),
    enabled: open,
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "question-topics"] });
  }

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/admin/question-topics", {
        department_id: departmentId,
        name: draft.name.trim(),
        slug: draft.slug || slugify(draft.name),
        description: draft.description.trim() || null,
        display_order: draft.display_order,
      }),
    onSuccess: () => {
      setDraft({ name: "", slug: "", description: "", display_order: 0 });
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: (t: BankTopic) =>
      api.put(`/api/admin/question-topics/${t.id}`, {
        department_id: t.department_id,
        name: t.name.trim(),
        slug: t.slug,
        description: t.description?.trim() || null,
        display_order: t.display_order,
        is_active: t.is_active,
      }),
    onSuccess: () => {
      setEditing(null);
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/question-topics/${id}`),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const list = topics.data ?? [];
  const departmentLabel = (id: number) => flatDepartments.find((d) => d.id === id)?.label ?? `#${id}`;

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Index topics">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Topics group a department’s questions on the student index page and in the Topic filter.
          Keep names broad — students see them before answering.
        </p>
        <Field label="Department" htmlFor="tm-dept">
          <Select id="tm-dept" value={departmentId} onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All departments</option>
            {flatDepartments.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </Select>
        </Field>

        {error && <Alert>{error}</Alert>}

        {topics.isLoading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted">No topics yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                {editing?.id === t.id ? (
                  <>
                    <Input className="h-8 flex-1 text-xs" value={editing.name} maxLength={120} aria-label="Topic name"
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                    <Input className="h-8 w-20 text-xs" type="number" min={0} max={10000} value={editing.display_order}
                      aria-label="Display order" onChange={(e) => setEditing({ ...editing, display_order: Number(e.target.value) })} />
                    <Input className="h-8 w-full text-xs" value={editing.description ?? ""} maxLength={500} placeholder="Description (optional)"
                      aria-label="Description" onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                    <span className="ml-auto flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                      <Button size="sm" loading={update.isPending} onClick={() => update.mutate(editing)}>Save</Button>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-8 shrink-0 text-xs tabular-nums text-muted">{t.display_order}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {!departmentId && `${departmentLabel(t.department_id)} · `}
                        {t.question_count} question{t.question_count === 1 ? "" : "s"}
                        {t.description ? ` · ${t.description}` : ""}
                      </span>
                    </span>
                    <Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-danger hover:text-danger"
                      aria-label={`Delete ${t.name}`} disabled={t.question_count > 0}
                      title={t.question_count > 0 ? "Move its questions first" : undefined}
                      onClick={() => { if (window.confirm(`Delete topic “${t.name}”?`)) remove.mutate(t.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium">New topic</legend>
          {!departmentId && <p className="text-xs text-muted">Pick a department above to add a topic to it.</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <Input value={draft.name} maxLength={120} placeholder="Name, e.g. Contraception" aria-label="New topic name"
              disabled={!departmentId} onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: slugify(e.target.value) })} />
            <Input value={draft.slug} maxLength={140} placeholder="slug" aria-label="New topic slug" disabled={!departmentId}
              onChange={(e) => setDraft({ ...draft, slug: slugify(e.target.value) })} />
            <Input type="number" min={0} max={10000} value={draft.display_order} aria-label="Display order" disabled={!departmentId}
              onChange={(e) => setDraft({ ...draft, display_order: Number(e.target.value) })} />
          </div>
          <Input value={draft.description} maxLength={500} placeholder="One-line description (optional)" aria-label="New topic description"
            disabled={!departmentId} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <Button size="sm" loading={create.isPending} disabled={!departmentId || !draft.name.trim()} onClick={() => create.mutate()}>
            <Plus className="h-3.5 w-3.5" /> Add topic
          </Button>
        </fieldset>
      </div>
    </Modal>
  );
}
