import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { CandidateRow, CandidateStatus, Origin, Paged } from "../lib/types";
import { DIFFICULTY_LABEL, ORIGIN_LABEL, QUESTION_TYPE_LABEL, formatDate } from "../lib/types";
import { useDepartments } from "../components/DepartmentPicker";
import { Alert, Badge, Card, CardBody, CardHeader, CheckSummary, EmptyState, Select, Spinner } from "../components/ui";

export function ReviewQueue() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as CandidateStatus | "all") ?? "pending";
  const origin = params.get("origin") ?? "";
  const departmentId = params.get("department_id") ?? "";
  const briefId = params.get("brief_id") ?? "";
  const needsAttention = params.get("needs_attention") === "1";
  const sort = params.get("sort") === "oldest" ? "oldest" : "newest";
  const page = Number(params.get("page") ?? 1);

  const { data: departments = [] } = useDepartments();

  const query = new URLSearchParams({ status, sort, page: String(page), page_size: "25" });
  if (origin) query.set("origin", origin);
  if (departmentId) query.set("department_id", departmentId);
  if (briefId) query.set("brief_id", briefId);
  if (needsAttention) query.set("needs_attention", "true");

  const candidates = useQuery({
    queryKey: ["candidates", query.toString()],
    queryFn: () => api.get<Paged<CandidateRow>>(`/api/clinician/candidates?${query}`),
  });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  }

  const total = candidates.data?.total ?? 0;
  const pageSize = candidates.data?.page_size ?? 25;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Review queue</h1>
        <p className="text-sm text-muted">
          Open a question to read it in full, edit it, and approve or reject it.
        </p>
      </div>

      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Status</span>
            <Select value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="pending">Waiting for review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Where it came from</span>
            <Select value={origin} onChange={(e) => setParam("origin", e.target.value)}>
              <option value="">Any source</option>
              {(Object.keys(ORIGIN_LABEL) as Origin[]).map((o) => (
                <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Department</span>
            <Select value={departmentId} onChange={(e) => setParam("department_id", e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">Sort</span>
            <Select value={sort} onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={needsAttention} className="h-4 w-4 accent-[rgb(var(--c-accent))]"
              onChange={(e) => setParam("needs_attention", e.target.checked ? "1" : "")} />
            <span className="text-sm">Only questions blocked by checks</span>
          </label>
        </CardBody>
      </Card>

      {candidates.isLoading ? (
        <Spinner />
      ) : candidates.error ? (
        <Alert>{(candidates.error as Error).message}</Alert>
      ) : total === 0 ? (
        <EmptyState title="Nothing here"
          description="No questions match these filters. Write one, import a file, or ask the AI for a batch." />
      ) : (
        <Card>
          <CardHeader title={`${total} question${total === 1 ? "" : "s"}`}
            description={`Page ${page} of ${lastPage}`} />
          <CardBody className="p-0">
            <ul>
              {candidates.data!.items.map((c) => (
                <li key={c.id} className="border-b border-border/60 last:border-0">
                  <Link to={`/review/${c.id}`} className="block px-4 py-3 hover:bg-surface-2/50">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.topic}</span>
                      <Badge>{QUESTION_TYPE_LABEL[c.question_type]}</Badge>
                      <Badge>{DIFFICULTY_LABEL[c.difficulty]}</Badge>
                      <Badge tone={c.origin === "ai" ? "accent" : "neutral"}>{ORIGIN_LABEL[c.origin]}</Badge>
                      {c.status !== "pending" && (
                        <Badge tone={c.status === "approved" ? "success" : "danger"}>{c.status}</Badge>
                      )}
                      <span className="ml-auto flex items-center gap-3">
                        <CheckSummary fail={c.checks.fail} warn={c.checks.warn} />
                        <time dateTime={c.created_at ?? undefined} title="Created"
                          className="whitespace-nowrap text-xs tabular-nums text-muted">
                          {formatDate(c.created_at)}
                        </time>
                      </span>
                    </span>
                    <span className="mt-1 block text-sm text-muted">{c.stem_preview}…</span>
                    <span className="mt-1 block text-xs text-muted">
                      {c.department} · {c.batch_label}
                      {c.approvals > 0 && ` · ${c.approvals} approval${c.approvals === 1 ? "" : "s"}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
          {lastPage > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
              <button disabled={page <= 1} className="text-muted disabled:opacity-40"
                onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("page", String(page - 1)); return n; }, { replace: true })}>
                ← Previous
              </button>
              <span className="text-muted">Page {page} of {lastPage}</span>
              <button disabled={page >= lastPage} className="text-muted disabled:opacity-40"
                onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set("page", String(page + 1)); return n; }, { replace: true })}>
                Next →
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
