import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { BankQuestion } from "../../lib/admin-types";
import { DIFFICULTY_LABEL, QUESTION_TYPE_LABEL, formatDate, type Paged } from "../../lib/types";
import { useDepartments } from "../../components/DepartmentPicker";
import { BankQuestionForm } from "../../components/BankQuestionForm";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Modal, Select, Spinner } from "../../components/ui";

const PAGE_SIZE = 25;

/** Mirrors the `sort` values GET /api/admin/questions accepts. */
const SORT_OPTIONS = [
  { value: "qid", label: "QID" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently edited" },
  { value: "topic", label: "Topic A–Z" },
] as const;

function difficultyTone(d: string): "success" | "warning" | "danger" | "neutral" {
  return d === "easy" ? "success" : d === "medium" ? "warning" : d === "hard" ? "danger" : "neutral";
}

/**
 * The live student bank: find, edit, publish drafts and delete. New questions
 * normally come in through Write / Import / Generate so doctors review them;
 * "New question" here is the admin's direct path and publishes immediately.
 */
export function AdminQuestions() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "published";
  const departmentId = params.get("department_id") ?? "";
  const difficulty = params.get("difficulty") ?? "";
  const q = params.get("q") ?? "";
  const sort = SORT_OPTIONS.some((o) => o.value === params.get("sort")) ? params.get("sort")! : "qid";
  const page = Math.max(1, Number(params.get("page") ?? 1));

  const [search, setSearch] = useState(q);
  const [editing, setEditing] = useState<BankQuestion | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BankQuestion | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: departments = [] } = useDepartments();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  // debounce the search box into the URL
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== q) setParam("q", search.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [search]); // setParam/q are read fresh each run; only typing should re-arm it

  const query = new URLSearchParams({ status, sort, page: String(page), page_size: String(PAGE_SIZE) });
  if (departmentId) query.set("department_id", departmentId);
  if (difficulty) query.set("difficulty", difficulty);
  if (q) query.set("q", q);

  const list = useQuery({
    queryKey: ["admin", "questions", query.toString()],
    queryFn: () => api.get<Paged<BankQuestion>>(`/api/admin/questions?${query}`),
  });

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice((n) => (n === message ? null : n)), 4000);
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "questions"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  }

  const publish = useMutation({
    mutationFn: (id: number) => api.patch(`/api/admin/questions/${id}/publish`, {}),
    onSuccess: () => {
      refresh();
      flash("Question published ✓");
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/api/admin/questions/${id}`),
    onSuccess: () => {
      setPendingDelete(null);
      refresh();
      flash("Question deleted");
    },
  });

  const total = list.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const departmentName = (id: number | null) => {
    for (const d of departments) {
      if (d.id === id) return d.name;
      const child = d.children.find((c) => c.id === id);
      if (child) return `${d.name} › ${child.name}`;
    }
    return null;
  };
  const actionError = (publish.error ?? remove.error) as Error | null;

  function actions(item: BankQuestion) {
    return (
      <span className="inline-flex items-center gap-1">
        {item.status === "draft" && (
          <Button variant="success" size="sm" loading={publish.isPending && publish.variables === item.id}
            onClick={() => publish.mutate(item.id)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Publish
          </Button>
        )}
        <Button variant="ghost" size="icon" aria-label={`Edit question ${item.qid ?? item.id}`}
          onClick={() => setEditing(item)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-danger hover:text-danger"
          aria-label={`Delete question ${item.qid ?? item.id}`} onClick={() => setPendingDelete(item)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Question bank</h1>
          <p className="text-sm text-muted">
            Questions students can see. To add questions with doctor review, use{" "}
            <Link to="/write" className="text-accent hover:underline">Write</Link>,{" "}
            <Link to="/import" className="text-accent hover:underline">Import</Link> or{" "}
            <Link to="/generate" className="text-accent hover:underline">Generate with AI</Link>.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New question
        </Button>
      </div>

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <span className="block text-sm font-medium">Search</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input className="pl-9" value={search} maxLength={200} placeholder="QID, topic or stem text"
                onChange={(e) => setSearch(e.target.value)} />
            </span>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Status</span>
            <Select value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
              <option value="archived">Archived</option>
              <option value="All">All</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Department</span>
            <Select value={departmentId} onChange={(e) => setParam("department_id", e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <optgroup key={d.id} label={d.name}>
                  <option value={d.id}>{d.name} (all)</option>
                  {[...d.children].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Difficulty</span>
            <Select value={difficulty} onChange={(e) => setParam("difficulty", e.target.value)}>
              <option value="">Any difficulty</option>
              {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Sort by</span>
            <Select value={sort} onChange={(e) => setParam("sort", e.target.value === "qid" ? "" : e.target.value)}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </label>
        </CardBody>
      </Card>

      {notice && <Alert tone="success">{notice}</Alert>}
      {actionError && <Alert>{actionError.message}</Alert>}

      {list.isLoading ? (
        <Spinner />
      ) : list.error ? (
        <Alert>{(list.error as Error).message}</Alert>
      ) : !list.data?.items.length ? (
        <EmptyState title="No questions match" description="Change the filters or the search." />
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-4 py-3 font-medium">QID</th>
                  <th className="px-4 py-3 font-medium">Topic</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Difficulty</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{item.qid ?? item.id}</td>
                    <td className="max-w-xs px-4 py-3">
                      <button type="button" className="block w-full truncate text-left hover:text-accent"
                        title={item.question_text} onClick={() => setEditing(item)}>
                        {item.topic}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted">{departmentName(item.department_id) ?? item.subject}</td>
                    <td className="px-4 py-3 text-muted">
                      {item.question_type ? QUESTION_TYPE_LABEL[item.question_type] : "—"}
                    </td>
                    <td className="px-4 py-3"><Badge tone={difficultyTone(item.difficulty)}>{item.difficulty}</Badge></td>
                    <td className="px-4 py-3">
                      <Badge tone={item.status === "published" ? "accent" : "neutral"}>{item.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-muted">
                      <time dateTime={item.created_at ?? undefined}>{formatDate(item.created_at)}</time>
                    </td>
                    <td className="px-4 py-3 text-right">{actions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-3 md:hidden">
            {list.data.items.map((item) => (
              <Card key={item.id} className="p-4">
                <button type="button" className="w-full text-left" onClick={() => setEditing(item)}>
                  <p className="truncate text-sm font-medium">{item.topic}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    #{item.qid ?? item.id} · {departmentName(item.department_id) ?? item.subject} ·{" "}
                    {formatDate(item.created_at)}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted">{item.question_text}</p>
                </button>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={item.status === "published" ? "accent" : "neutral"}>{item.status}</Badge>
                  <Badge tone={difficultyTone(item.difficulty)}>{item.difficulty}</Badge>
                  <span className="ml-auto">{actions(item)}</span>
                </div>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-muted">
              {total} question{total === 1 ? "" : "s"} · page {page} of {lastPage}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1}
                onClick={() => setParam("page", String(page - 1))}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= lastPage}
                onClick={() => setParam("page", String(page + 1))}>Next</Button>
            </span>
          </div>
        </>
      )}

      <BankQuestionForm
        key={editing ? `edit-${editing.id}` : creating ? "create" : "closed"}
        question={editing}
        open={creating || editing !== null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={(message) => {
          refresh();
          flash(message);
        }}
      />

      <Modal open={pendingDelete !== null} onClose={() => setPendingDelete(null)} title="Delete question?">
        <p className="text-sm text-muted">
          This permanently deletes #{pendingDelete?.qid ?? pendingDelete?.id} “{pendingDelete?.topic}”, its options
          and every student answer to it. This cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending}
            onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
