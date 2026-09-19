import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ListChecks, Sparkles, Star, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, downloadWithAuth } from "../../lib/api";
import type { AdminStats, Analytics } from "../../lib/admin-types";
import { Alert, Badge, Button, Card, CardBody, CardHeader, Spinner } from "../../components/ui";

const STAT_CARDS: { key: keyof AdminStats; label: string; icon: LucideIcon; tone: string }[] = [
  { key: "users", label: "Registered users", icon: Users, tone: "text-accent" },
  { key: "premium_subscriptions", label: "Premium subscriptions", icon: Sparkles, tone: "text-accent" },
  { key: "mcq_count", label: "MCQs in bank", icon: ListChecks, tone: "text-accent-green" },
  { key: "recall_docs", label: "Recall documents", icon: FileText, tone: "text-warning" },
];

/** Platform stats + cohort analytics (REQ-10.2.1) + per-user CSV export (REQ-10.2.2). */
export function AdminDashboard() {
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get<AdminStats>("/api/admin/stats") });
  const analytics = useQuery({
    queryKey: ["admin", "analytics"],
    queryFn: () => api.get<Analytics>("/api/admin/analytics"),
  });
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function exportCsv() {
    setDownloading(true);
    setDownloadError(null);
    try {
      // The server's Content-Disposition name isn't readable cross-origin, so date it here.
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadWithAuth("/api/admin/analytics/export", `amc-performance-${stamp}.csv`);
    } catch {
      setDownloadError("Could not download the export. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const data = analytics.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Platform analytics</h1>
        <p className="text-sm text-muted">Students, subscriptions and how the cohort is performing.</p>
      </div>

      {stats.error ? (
        <Alert>{(stats.error as Error).message}</Alert>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STAT_CARDS.map(({ key, label, icon: Icon, tone }) => (
            <Card key={key}>
              <CardBody>
                <p className="flex items-center gap-2 text-xs text-muted">
                  <Icon className={`h-4 w-4 ${tone}`} /> {label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {stats.data ? stats.data[key].toLocaleString() : "—"}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {analytics.isLoading ? (
        <Spinner />
      ) : analytics.error || !data ? (
        <Alert>{(analytics.error as Error | null)?.message ?? "Could not load analytics."}</Alert>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardBody>
                <h2 className="mb-2 text-sm font-semibold">Engagement</h2>
                <p className="text-2xl font-semibold tabular-nums">
                  {data.active_users}
                  <span className="text-base font-normal text-muted"> / {data.total_users}</span>
                </p>
                <p className="text-xs text-muted">
                  users active in the last {data.active_window_days} days — measured by questions attempted, not logins
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <h2 className="mb-2 text-sm font-semibold">Recall vs other topics</h2>
                <div className="mb-1 flex items-baseline gap-4">
                  <p className="text-2xl font-semibold tabular-nums text-warning">
                    {data.recall_performance.recall.accuracy}%
                  </p>
                  <p className="text-2xl font-semibold tabular-nums text-muted">
                    {data.recall_performance.non_recall.accuracy}%
                  </p>
                </div>
                <p className="text-xs text-muted">
                  recall ({data.recall_performance.recall.attempts} attempts) vs non-recall (
                  {data.recall_performance.non_recall.attempts}) across all users
                </p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Most attempted departments" />
            <CardBody>
              {data.most_attempted_departments.length ? (
                <ul className="space-y-2">
                  {data.most_attempted_departments.map((d) => (
                    <li key={d.subject} className="flex items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate">{d.subject}</span>
                      <span className="whitespace-nowrap tabular-nums text-muted">
                        {d.users} {d.users === 1 ? "user" : "users"}
                      </span>
                      <span className="w-24 whitespace-nowrap text-right tabular-nums text-muted">
                        {d.attempts} attempts
                      </span>
                      <span className="w-14 text-right tabular-nums">{d.accuracy}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No attempts recorded yet.</p>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Lowest-scoring topics"
              description={`Only topics with at least ${data.min_attempts_for_topic_ranking} attempts, so one wrong answer by one user can't top the chart.`}
            />
            <CardBody>
              {data.lowest_scoring_topics.length ? (
                <ul className="space-y-2">
                  {data.lowest_scoring_topics.map((t) => (
                    <li key={t.topic} className="flex items-center gap-2 text-sm">
                      {t.recall_flag && (
                        <Star className="h-3.5 w-3.5 shrink-0 fill-warning text-warning" aria-label="High-frequency AMC topic" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{t.topic}</span>
                      <Badge>{t.subject}</Badge>
                      <span className="w-16 whitespace-nowrap text-right tabular-nums text-muted">n={t.attempts}</span>
                      <span className="w-14 text-right tabular-nums text-danger">{t.accuracy}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">
                  No topic has reached {data.min_attempts_for_topic_ranking} attempts yet.
                </p>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Export user performance</h2>
            <p className="text-xs text-muted">CSV, one row per user. Contains personal data — handle accordingly.</p>
          </div>
          <Button variant="outline" loading={downloading} onClick={() => void exportCsv()}>
            {!downloading && <Download className="h-4 w-4" />}
            {downloading ? "Preparing…" : "Download CSV"}
          </Button>
          {downloadError && <p className="w-full text-sm text-danger">{downloadError}</p>}
        </CardBody>
      </Card>
    </div>
  );
}
