import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../../lib/api";
import { PLANS, formatDay, type AdminUser } from "../../lib/admin-types";
import { Alert, Badge, Card, EmptyState, Input, Select, Spinner } from "../../components/ui";

function planTone(plan: string): "neutral" | "accent" | "success" {
  if (plan === "monthly") return "accent";
  if (plan === "annual") return "success";
  return "neutral";
}

export function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const users = useQuery({
    queryKey: ["admin", "users", q],
    queryFn: () =>
      api.get<AdminUser[]>(q ? `/api/admin/users?q=${encodeURIComponent(q)}` : "/api/admin/users"),
  });

  const changePlan = useMutation({
    mutationFn: ({ id, plan }: { id: number; plan: string }) =>
      api.patch(`/api/admin/users/${id}/subscription`, { subscription_status: plan }),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setSavedId(id);
      setTimeout(() => setSavedId((current) => (current === id ? null : current)), 2500);
    },
  });

  function planPicker(u: AdminUser, className?: string) {
    return (
      <div className="flex items-center gap-2">
        <Select
          className={className}
          value={u.subscription_status}
          disabled={changePlan.isPending && changePlan.variables?.id === u.id}
          onChange={(e) => changePlan.mutate({ id: u.id, plan: e.target.value })}
          aria-label={`Change plan for ${u.email}`}
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        {savedId === u.id && <span className="shrink-0 text-xs text-accent-green">Saved ✓</span>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <p className="text-sm text-muted">Latest 200 student accounts — search by name or email.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" placeholder="Search name or email…" value={search} maxLength={200}
          onChange={(e) => setSearch(e.target.value)} aria-label="Search users" />
      </div>

      {changePlan.error && <Alert>{(changePlan.error as Error).message}</Alert>}

      {users.isLoading ? (
        <Spinner />
      ) : users.error ? (
        <Alert>{(users.error as Error).message}</Alert>
      ) : !users.data?.length ? (
        <EmptyState title="No users found" description={q ? `No matches for “${q}”.` : "No accounts registered yet."} />
      ) : (
        <>
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Country</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 font-medium">Change plan</th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{u.full_name}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3 text-muted">{u.country ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{formatDay(u.created_at)}</td>
                    <td className="px-4 py-3"><Badge tone={planTone(u.subscription_status)}>{u.subscription_status}</Badge></td>
                    <td className="px-4 py-3 text-muted">{formatDay(u.last_login)}</td>
                    <td className="px-4 py-3">{planPicker(u, "h-8 w-28 text-xs")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="space-y-3 md:hidden">
            {users.data.map((u) => (
              <Card key={u.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{u.full_name}</p>
                    <p className="truncate text-sm text-muted">{u.email}</p>
                  </div>
                  <Badge tone={planTone(u.subscription_status)}>{u.subscription_status}</Badge>
                </div>
                <p className="text-xs text-muted">
                  {u.country ?? "Country unknown"} · Joined {formatDay(u.created_at)} · Last login {formatDay(u.last_login)}
                </p>
                {planPicker(u, "h-8 text-xs")}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
