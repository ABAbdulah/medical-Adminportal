import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { BookOpen, Pencil, Plus, Quote as QuoteIcon, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import type { Article, Quote } from "../../lib/admin-types";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Modal, Spinner, Textarea } from "../../components/ui";

// Bounds mirror QuoteIn / ArticleIn in backend/routers/admin.py.
const quoteSchema = z.object({
  quote: z.string().trim().min(1, "Quote text is required").max(1000),
  author: z.string().trim().min(1, "Author is required").max(200),
  category: z.string().trim().min(1, "Category is required").max(50),
});

const articleSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  category: z.string().trim().min(1, "Category is required").max(50),
  summary: z.string().trim().min(1, "Summary is required").max(2000),
  content: z.string().trim().min(1, "Content is required").max(100_000),
});

type ArticleDraft = z.infer<typeof articleSchema>;
const EMPTY_ARTICLE: ArticleDraft = { title: "", category: "", summary: "", content: "" };
type PendingDelete = { kind: "quote" | "article"; id: number; label: string };

function firstErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

/** Motivation quotes (student dashboard) and wellbeing articles. */
export function AdminContent() {
  const queryClient = useQueryClient();
  const quotes = useQuery({ queryKey: ["admin", "quotes"], queryFn: () => api.get<Quote[]>("/api/admin/quotes") });
  const articles = useQuery({
    queryKey: ["admin", "articles"],
    queryFn: () => api.get<Article[]>("/api/motivation/resources"),
  });

  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState({ quote: "", author: "", category: "motivation" });
  const [quoteErrors, setQuoteErrors] = useState<Record<string, string>>({});

  const [articleOpen, setArticleOpen] = useState(false);
  const [articleEditing, setArticleEditing] = useState<Article | null>(null);
  const [articleDraft, setArticleDraft] = useState<ArticleDraft>(EMPTY_ARTICLE);
  const [articleErrors, setArticleErrors] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice((n) => (n === message ? null : n)), 4000);
  }

  const saveQuote = useMutation({
    mutationFn: (body: z.infer<typeof quoteSchema>) => api.post("/api/admin/quotes", body),
    onSuccess: () => {
      setQuoteOpen(false);
      setQuoteDraft({ quote: "", author: "", category: "motivation" });
      flash("Quote added ✓");
      void queryClient.invalidateQueries({ queryKey: ["admin", "quotes"] });
    },
  });

  const saveArticle = useMutation({
    mutationFn: (body: ArticleDraft) =>
      articleEditing ? api.put(`/api/admin/articles/${articleEditing.id}`, body) : api.post("/api/admin/articles", body),
    onSuccess: () => {
      flash(articleEditing ? "Article saved ✓" : "Article added ✓");
      setArticleOpen(false);
      setArticleEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["admin", "articles"] });
    },
  });

  const remove = useMutation({
    mutationFn: (target: PendingDelete) =>
      api.delete(target.kind === "quote" ? `/api/admin/quotes/${target.id}` : `/api/admin/articles/${target.id}`),
    onSuccess: (_data, target) => {
      setPendingDelete(null);
      flash(target.kind === "quote" ? "Quote deleted" : "Article deleted");
      void queryClient.invalidateQueries({ queryKey: ["admin", target.kind === "quote" ? "quotes" : "articles"] });
    },
  });

  const articlesByCategory = useMemo(() => {
    const groups = new Map<string, Article[]>();
    for (const a of articles.data ?? []) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);
    return Array.from(groups.entries());
  }, [articles.data]);

  function submitQuote() {
    const parsed = quoteSchema.safeParse(quoteDraft);
    setQuoteErrors(parsed.success ? {} : firstErrors(parsed.error.issues));
    if (parsed.success) saveQuote.mutate(parsed.data);
  }

  function openArticle(article: Article | null) {
    setArticleEditing(article);
    setArticleDraft(article ? { title: article.title, category: article.category, summary: article.summary, content: article.content } : EMPTY_ARTICLE);
    setArticleErrors({});
    saveArticle.reset();
    setArticleOpen(true);
  }

  function submitArticle() {
    const parsed = articleSchema.safeParse(articleDraft);
    setArticleErrors(parsed.success ? {} : firstErrors(parsed.error.issues));
    if (parsed.success) saveArticle.mutate(parsed.data);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Content</h1>
        <p className="text-sm text-muted">Motivation quotes and wellbeing articles shown to students.</p>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Motivation quotes" description="Shown on the student dashboard."
            actions={<Button size="sm" onClick={() => { saveQuote.reset(); setQuoteErrors({}); setQuoteOpen(true); }}><Plus className="h-4 w-4" /> Add quote</Button>} />
          <CardBody>
            {quotes.isLoading ? (
              <Spinner />
            ) : quotes.error ? (
              <Alert>{(quotes.error as Error).message}</Alert>
            ) : !quotes.data?.length ? (
              <EmptyState title="No quotes yet" description="Add the first motivation quote." />
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {quotes.data.map((q) => (
                  <li key={q.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                    <blockquote className="min-w-0 text-sm">
                      <QuoteIcon className="mb-1 h-3.5 w-3.5 text-muted" aria-hidden />
                      {q.quote}
                      <footer className="mt-1 flex items-center gap-2 text-xs text-muted">
                        — {q.author} <Badge>{q.category}</Badge>
                      </footer>
                    </blockquote>
                    <Button variant="ghost" size="icon" className="shrink-0 text-danger hover:text-danger"
                      aria-label={`Delete quote by ${q.author}`}
                      onClick={() => setPendingDelete({ kind: "quote", id: q.id, label: `the quote by ${q.author}` })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Wellbeing articles" description="Burnout-support resources, grouped by category."
            actions={<Button size="sm" onClick={() => openArticle(null)}><Plus className="h-4 w-4" /> Add article</Button>} />
          <CardBody>
            {articles.isLoading ? (
              <Spinner />
            ) : articles.error ? (
              <Alert>{(articles.error as Error).message}</Alert>
            ) : !articlesByCategory.length ? (
              <EmptyState title="No articles yet" description="Add the first wellbeing article." />
            ) : (
              <div className="space-y-4">
                {articlesByCategory.map(([category, items]) => (
                  <div key={category}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{category}</p>
                    <ul className="space-y-2">
                      {items.map((a) => (
                        <li key={a.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-start gap-2">
                            <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={expandedId === a.id}
                              onClick={() => setExpandedId((id) => (id === a.id ? null : a.id))}>
                              <p className="flex items-center gap-1.5 text-sm font-medium">
                                <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden /> {a.title}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.summary}</p>
                            </button>
                            <Button variant="ghost" size="icon" aria-label={`Edit article ${a.title}`} onClick={() => openArticle(a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-danger hover:text-danger"
                              aria-label={`Delete article ${a.title}`}
                              onClick={() => setPendingDelete({ kind: "article", id: a.id, label: `“${a.title}”` })}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {expandedId === a.id && (
                            // shown as source text, never rendered as HTML
                            <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-2/60 p-3 font-sans text-xs text-muted">
                              {a.content}
                            </pre>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal open={quoteOpen} onClose={() => setQuoteOpen(false)} title="Add quote">
        <div className="space-y-3">
          <Field label="Quote" htmlFor="quote-text" error={quoteErrors.quote}>
            <Textarea id="quote-text" rows={3} maxLength={1000} value={quoteDraft.quote}
              onChange={(e) => setQuoteDraft({ ...quoteDraft, quote: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Author" htmlFor="quote-author" error={quoteErrors.author}>
              <Input id="quote-author" maxLength={200} value={quoteDraft.author}
                onChange={(e) => setQuoteDraft({ ...quoteDraft, author: e.target.value })} />
            </Field>
            <Field label="Category" htmlFor="quote-category" error={quoteErrors.category}>
              <Input id="quote-category" maxLength={50} value={quoteDraft.category}
                onChange={(e) => setQuoteDraft({ ...quoteDraft, category: e.target.value })} />
            </Field>
          </div>
          {saveQuote.error && <Alert>{(saveQuote.error as Error).message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setQuoteOpen(false)}>Cancel</Button>
            <Button loading={saveQuote.isPending} onClick={submitQuote}>Add quote</Button>
          </div>
        </div>
      </Modal>

      <Modal open={articleOpen} onClose={() => setArticleOpen(false)} size="lg"
        title={articleEditing ? "Edit article" : "Add article"}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor="article-title" error={articleErrors.title}>
              <Input id="article-title" maxLength={255} value={articleDraft.title}
                onChange={(e) => setArticleDraft({ ...articleDraft, title: e.target.value })} />
            </Field>
            <Field label="Category" htmlFor="article-category" error={articleErrors.category}>
              <Input id="article-category" maxLength={50} placeholder="e.g. stress, sleep, mindset" value={articleDraft.category}
                onChange={(e) => setArticleDraft({ ...articleDraft, category: e.target.value })} />
            </Field>
          </div>
          <Field label="Summary" htmlFor="article-summary" error={articleErrors.summary}>
            <Textarea id="article-summary" rows={2} maxLength={2000} value={articleDraft.summary}
              onChange={(e) => setArticleDraft({ ...articleDraft, summary: e.target.value })} />
          </Field>
          <Field label="Content (HTML)" htmlFor="article-content" error={articleErrors.content}
            hint="Scripts, styles and event handlers are stripped by the server before it is stored.">
            <Textarea id="article-content" rows={10} maxLength={100_000} className="font-mono text-xs"
              placeholder="<p>Article body in HTML…</p>" value={articleDraft.content}
              onChange={(e) => setArticleDraft({ ...articleDraft, content: e.target.value })} />
          </Field>
          {saveArticle.error && <Alert>{(saveArticle.error as Error).message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setArticleOpen(false)}>Cancel</Button>
            <Button loading={saveArticle.isPending} onClick={submitArticle}>
              {articleEditing ? "Save changes" : "Add article"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={pendingDelete !== null} onClose={() => setPendingDelete(null)}
        title={pendingDelete?.kind === "article" ? "Delete article?" : "Delete quote?"}>
        <p className="text-sm text-muted">This permanently deletes {pendingDelete?.label}. This cannot be undone.</p>
        {remove.error && <div className="mt-3"><Alert>{(remove.error as Error).message}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => pendingDelete && remove.mutate(pendingDelete)}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
