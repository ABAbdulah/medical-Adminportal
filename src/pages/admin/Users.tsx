import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Search, UserPlus } from "lucide-react";
import { api } from "../../lib/api";
import { formatDay, type AdminPlan, type AdminUser, type Entitlement } from "../../lib/admin-types";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner } from "../../components/ui";
import { CreateUserDialog } from "../../components/CreateUserDialog";

function planTone(plan: string): "neutral" | "accent" | "success" {
  return plan === "free" ? "neutral" : "success";
}

/** Grant history for one user, a dated grant form, and revoke. */
function AccessDialog({ user, plans, onClose }: { user: AdminUser; plans: AdminPlan[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const history = useQuery({
    queryKey: ["admin", "entitlements", user.id],
    queryFn: () => api.get<Entitlement[]>(`/api/admin/users/${user.id}/entitlements`),
  });
  const [plan, setPlan] = useState(plans[0]?.slug ?? "");
  const [days, setDays] = useState("30");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "entitlements", user.id] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
  };
  const grant = useMutation({
    mutationFn: () =>
      api.post(`/api/admin/users/${user.id}/entitlements`, { plan, days: Number(days), note: note.trim() || null }),
    onSuccess: () => {
      setNote("");
      refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.post(`/api/admin/entitlements/${id}/revoke`),
    onSuccess: refresh,
  });

  function submit() {
    const n = Number(days);
    if (!plan) return setError("Pick a plan");
    if (!Number.isInteger(n) || n < 1 || n > 3650) return setError("Days must be a whole number from 1 to 3650");
    if (note.length > 300) return setError("Keep the note under 300 characters");
    setError(null);
    grant.mutate();
  }

  return (
    <Modal open onClose={onClose} title={`Access for ${user.email}`} size="lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Plan" htmlFor="grant-plan">
            <Select id="grant-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {plans.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Days" htmlFor="grant-days">
            <Input id="grant-days" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} />
          </Field>
          <Field label="Note (optional)" htmlFor="grant-note">
            <Input id="grant-note" maxLength={300} value={note} placeholder="e.g. beta tester"
              onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {(error || grant.error) && <Alert>{error ?? (grant.error as Error).message}</Alert>}
        <div className="flex justify-end">
          <Button loading={grant.isPending} onClick={submit}>Grant access</Button>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium">History</h3>
          {history.isLoading ? (
            <Spinner />
          ) : history.error ? (
            <Alert>{(history.error as Error).message}</Alert>
          ) : !history.data?.length ? (
            <p className="text-sm text-muted">No paid access yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.data.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{e.plan}</span>
                    <span className="text-muted"> · {e.source} · {formatDay(e.starts_at)} → {formatDay(e.ends_at)}</span>
                    {e.cancel_at_period_end && <span className="text-muted"> · cancels at period end</span>}
                    {e.note && <p className="truncate text-xs text-muted">{e.note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={e.running ? "success" : "neutral"}>
                      {e.running ? "running" : e.status === "active" ? "ended" : e.status}
                    </Badge>
                    {e.running && (
                      <Button size="sm" variant="outline" loading={revoke.isPending && revoke.variables === e.id}
                        onClick={() => revoke.mutate(e.id)}
                        title={e.source === "polar" ? "Also cancel it in Polar, or the next renewal restores it" : undefined}>
                        Revoke
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {revoke.error && <Alert>{(revoke.error as Error).message}</Alert>}
        </div>
      </div>
    </Modal>
  );
}

export function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [accessFor, setAccessFor] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api.get<AdminPlan[]>("/api/admin/plans") });
  const planSlugs = ["free", ...(plans.data ?? []).filter((p) => p.is_active).map((p) => p.slug)];

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
          {(planSlugs.includes(u.subscription_status) ? planSlugs : [...planSlugs, u.subscription_status]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </Select>
        <Button size="sm" variant="outline" onClick={() => setAccessFor(u)} aria-label={`Access history for ${u.email}`}>
          <KeyRound className="h-3.5 w-3.5" /> Access
        </Button>
        {savedId === u.id && <span className="shrink-0 text-xs text-accent-green">Saved ✓</span>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Users</h1>
          <p className="text-sm text-muted">
            Latest 200 student accounts — search by name or email. Changing the plan grants one period of it;
            use <strong>Access</strong> to grant a set number of days or to revoke.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <UserPlus className="h-4 w-4" /> Create user
        </Button>
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
                    <td className="px-4 py-3">
                      <Badge tone={planTone(u.subscription_status)}>{u.subscription_status}</Badge>
                      {u.premium_until && <p className="mt-1 text-xs text-muted">until {formatDay(u.premium_until)}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDay(u.last_login)}</td>
                    <td className="px-4 py-3">{planPicker(u, "h-8 w-32 text-xs")}</td>
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
                  {u.premium_until && <> · Paid until {formatDay(u.premium_until)}</>}
                </p>
                {planPicker(u, "h-8 text-xs")}
              </Card>
            ))}
          </div>
        </>
      )}

      {creating && (
        <CreateUserDialog plans={(plans.data ?? []).filter((p) => p.is_active)} onClose={() => setCreating(false)} />
      )}

      {accessFor && (
        <AccessDialog
          user={accessFor}
          plans={(plans.data ?? []).filter((p) => p.is_active || p.slug === accessFor.subscription_status)}
          onClose={() => setAccessFor(null)}
        />
      )}
    </div>
  );
}
