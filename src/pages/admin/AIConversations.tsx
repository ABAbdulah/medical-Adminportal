import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Spinner } from "../../components/ui";
import { api } from "../../lib/api";
import type { AdminAIConversationDetail, AdminAIConversationPage } from "../../lib/admin-types";

const PAGE_SIZE = 25;

function formatDateTime(value: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

function sourceName(source: string | { name: string; section?: string | null }) {
  return typeof source === "string" ? source : source.name;
}

export function AdminAIConversations() {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const conversations = useQuery({
    queryKey: ["admin", "ai-conversations", query, page],
    queryFn: () => api.get<AdminAIConversationPage>(
      `/api/admin/ai-conversations?q=${encodeURIComponent(query)}&page=${page}&page_size=${PAGE_SIZE}`,
    ),
  });

  useEffect(() => {
    const items = conversations.data?.items ?? [];
    if (!items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id ?? null);
  }, [conversations.data, selectedId]);

  const detail = useQuery({
    queryKey: ["admin", "ai-conversation", selectedId],
    queryFn: () => api.get<AdminAIConversationDetail>(`/api/admin/ai-conversations/${selectedId}`),
    enabled: selectedId !== null,
  });

  const totalPages = Math.max(1, Math.ceil((conversations.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">AI conversations</h1>
        <p className="text-sm text-muted">Review tutor questions and replies to identify gaps in content and answer quality.</p>
      </div>

      <Alert tone="warning">
        Conversation text may include sensitive clinical details. Use it only for internal content and quality review.
      </Alert>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Search titles and conversation text…"
          value={search}
          maxLength={120}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search AI conversations"
        />
      </div>

      {conversations.isLoading ? (
        <Spinner />
      ) : conversations.error ? (
        <Alert>{(conversations.error as Error).message}</Alert>
      ) : !conversations.data?.total ? (
        <EmptyState
          title={query ? "No matching conversations" : "No AI conversations yet"}
          description={query ? "Try another search phrase." : "Saved tutor conversations will appear here."}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.55fr)]">
          <Card className="overflow-hidden">
            <CardHeader title="Conversation history" description={`${conversations.data.total.toLocaleString()} conversations`} />
            <div className="max-h-[62vh] overflow-y-auto">
              {conversations.data.items.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                  aria-current={selectedId === conversation.id ? "true" : undefined}
                  className={`block min-h-16 w-full border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    selectedId === conversation.id ? "bg-accent/10" : ""
                  }`}
                >
                  <span className="block truncate text-sm font-medium">{conversation.title || "AI tutor chat"}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span>Account #{conversation.user_id}</span>
                    <span aria-hidden>·</span>
                    <span>{formatDateTime(conversation.last_message_at ?? conversation.created_at)}</span>
                    <span aria-hidden>·</span>
                    <span>{conversation.message_count} messages</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-xs text-muted">Page {page} of {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            {detail.isLoading ? (
              <CardBody><Spinner label="Loading conversation…" /></CardBody>
            ) : detail.error ? (
              <CardBody><Alert>{(detail.error as Error).message}</Alert></CardBody>
            ) : detail.data ? (
              <>
                <CardHeader
                  title={detail.data.title || "AI tutor chat"}
                  description={`Account #${detail.data.user_id} · Started ${formatDateTime(detail.data.created_at)}`}
                  actions={
                    <div className="flex flex-wrap gap-1.5">
                      {detail.data.question_id !== null && <Badge tone="accent">Question #{detail.data.question_id}</Badge>}
                      {detail.data.topic_slug && <Badge>{detail.data.topic_slug}</Badge>}
                    </div>
                  }
                />
                <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
                  {detail.data.messages.map((message) => (
                    <article key={message.id} className="rounded-lg border border-border bg-surface-2 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Badge tone={message.role === "assistant" ? "accent" : "neutral"}>
                          {message.role === "assistant" ? "AI tutor" : "User"}
                        </Badge>
                        <time className="text-xs text-muted">{formatDateTime(message.created_at)}</time>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
                      {message.sources.length > 0 && (
                        <div className="mt-3 border-t border-border pt-2">
                          <p className="mb-1 text-xs font-medium text-muted">Cited sources</p>
                          <ul className="flex flex-wrap gap-1.5">
                            {message.sources.map((source, index) => (
                              <li key={`${sourceName(source)}-${index}`}>
                                <Badge>{sourceName(source)}</Badge>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </article>
                  ))}
                  {!detail.data.messages.length && <EmptyState title="No saved messages" />}
                </div>
              </>
            ) : (
              <CardBody><EmptyState title="Select a conversation" description="Choose a chat from the history list to review its messages." /></CardBody>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
