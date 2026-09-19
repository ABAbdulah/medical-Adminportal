import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileUp, PenLine, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import type { Meta, Stats } from "../lib/types";
import { Alert, Button, Card, CardBody, CardHeader, Spinner } from "../components/ui";

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "danger" | "success" }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "danger" ? "text-danger" : tone === "success" ? "text-accent-green" : ""}`}>
        {value}
      </p>
    </Card>
  );
}

export function Overview() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api.get<Stats>("/api/clinician/stats") });
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/clinician/meta") });

  const goal = Number(meta.data?.settings?.["portal.topic_goal"] ?? 100);

  if (stats.isLoading) return <Spinner />;
  if (stats.error) return <Alert>{(stats.error as Error).message}</Alert>;
  const s = stats.data!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Overview</h1>
        <p className="text-sm text-muted">
          Questions go into a queue, get checked, and only reach students once{" "}
          {meta.data?.limits.required_approvals ?? 1} doctor
          {(meta.data?.limits.required_approvals ?? 1) > 1 ? "s have" : " has"} approved them.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Waiting for review" value={s.pending} />
        <Stat label="Approved" value={s.approved} tone="success" />
        <Stat label="Blocked by checks" value={s.needs_attention} tone={s.needs_attention ? "danger" : undefined} />
        <Stat label="Your reviews today" value={s.my_reviews_today} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/write">
          <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-accent/50">
            <PenLine className="mt-0.5 h-5 w-5 text-accent" />
            <span>
              <span className="block font-medium">Write a question</span>
              <span className="block text-sm text-muted">Type one by hand, with the same checks applied.</span>
            </span>
          </Card>
        </Link>
        <Link to="/import">
          <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-accent/50">
            <FileUp className="mt-0.5 h-5 w-5 text-accent" />
            <span>
              <span className="block font-medium">Import a file</span>
              <span className="block text-sm text-muted">Upload CSV or JSON and preview every row first.</span>
            </span>
          </Card>
        </Link>
        <Link to="/generate">
          <Card className="flex h-full items-start gap-3 p-4 transition-colors hover:border-accent/50">
            <Sparkles className="mt-0.5 h-5 w-5 text-accent" />
            <span>
              <span className="block font-medium">Ask the AI</span>
              <span className="block text-sm text-muted">Give instructions and examples; review what comes back.</span>
            </span>
          </Card>
        </Link>
      </div>

      {s.needs_attention > 0 && (
        <Alert tone="warning">
          <span className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {s.needs_attention} question{s.needs_attention === 1 ? "" : "s"} cannot be approved until the
            flagged problems are fixed.
            <Link to="/review?needs_attention=1" className="underline">Open them</Link>
          </span>
        </Alert>
      )}

      <Card>
        <CardHeader
          title="Progress by topic"
          description={`Target: ${goal} approved questions per topic.`}
          actions={<Button variant="outline" size="sm" onClick={() => stats.refetch()}>Refresh</Button>}
        />
        <CardBody className="p-0">
          {s.topics.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">
              No questions yet. Write one, import a file, or ask the AI to draft a batch.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Topic</th>
                    <th className="px-4 py-2 font-medium">Department</th>
                    <th className="px-4 py-2 font-medium">Approved</th>
                    <th className="px-4 py-2 font-medium">Pending</th>
                    <th className="w-40 px-4 py-2 font-medium">To target</th>
                  </tr>
                </thead>
                <tbody>
                  {s.topics.map((t) => {
                    const pct = Math.min(100, Math.round((t.approved / Math.max(1, goal)) * 100));
                    return (
                      <tr key={`${t.department}:${t.topic}`} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-2 font-medium">{t.topic}</td>
                        <td className="px-4 py-2 text-muted">{t.department}</td>
                        <td className="px-4 py-2 text-accent-green">{t.approved}</td>
                        <td className="px-4 py-2">{t.pending}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                              <div className="h-full rounded-full bg-accent-green" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-9 shrink-0 text-right text-xs text-muted">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
