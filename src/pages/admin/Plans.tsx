import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import { formatAmount, formatCadence, formatPrice, type AdminPlan } from "../../lib/admin-types";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from "../../components/ui";

/** Mirrors routers/admin.py PlanIn. */
const planSchema = z
  .object({
    slug: z.string().trim().min(1, "Slug is required").max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, digits and hyphens")
      .refine((v) => v !== "free", "'free' is the built-in free plan"),
    name: z.string().trim().min(1, "Name is required").max(80),
    kind: z.enum(["recurring", "pass"]),
    interval: z.enum(["month", "year"]).nullable(),
    interval_count: z.number().int().min(1).max(24),
    duration_days: z.number().int().min(1).max(1095).nullable(),
    price_amount: z.number().int().min(0).max(1_000_000_000),
    currency: z.string().trim().regex(/^[A-Z]{3}$/, "Three capital letters, e.g. USD"),
    features: z.array(z.string().trim().min(1).max(120)).max(12, "At most 12 features"),
    is_active: z.boolean(),
    display_order: z.number().int().min(0).max(1000),
    polar_product_id: z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/, "Letters, digits, - and _").nullable(),
  })
  .superRefine((p, ctx) => {
    if (p.kind === "recurring" && !p.interval) ctx.addIssue({ code: "custom", path: ["interval"], message: "Pick month or year" });
    if (p.kind === "pass" && !p.duration_days) ctx.addIssue({ code: "custom", path: ["duration_days"], message: "How many days of access?" });
  });

interface Draft {
  slug: string; name: string; kind: "recurring" | "pass"; interval: "month" | "year" | ""; interval_count: string;
  duration_days: string; price: string; currency: string; features: string; is_active: boolean;
  display_order: string; polar_product_id: string;
}

const EMPTY: Draft = {
  slug: "", name: "", kind: "recurring", interval: "month", interval_count: "1", duration_days: "90", price: "",
  currency: "USD", features: "", is_active: false, display_order: "0", polar_product_id: "",
};

function toDraft(p: AdminPlan): Draft {
  return {
    slug: p.slug, name: p.name, kind: p.kind, interval: p.interval ?? "", interval_count: String(p.interval_count),
    duration_days: String(p.duration_days ?? ""), price: (p.price_amount / 100).toFixed(2), currency: p.currency,
    features: p.features.join("\n"), is_active: p.is_active, display_order: String(p.display_order),
    polar_product_id: p.polar_product_id ?? "",
  };
}

function toPayload(d: Draft) {
  return {
    slug: d.slug.trim(), name: d.name.trim(), kind: d.kind,
    interval: d.kind === "recurring" ? (d.interval || null) : null,
    interval_count: Number(d.interval_count) || 1,
    duration_days: d.kind === "pass" ? (Number(d.duration_days) || null) : null,
    price_amount: Math.round(Number(d.price) * 100),
    currency: d.currency.trim().toUpperCase(),
    features: d.features.split("\n").map((f) => f.trim()).filter(Boolean),
    is_active: d.is_active, display_order: Number(d.display_order) || 0,
    polar_product_id: d.polar_product_id.trim() || null,
  };
}

function firstErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

/** Paid plans students can buy. Prices and cadence come from Polar ("Sync from Polar"). */
export function AdminPlans() {
  const queryClient = useQueryClient();
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: () => api.get<AdminPlan[]>("/api/admin/plans") });
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });

  const save = useMutation({
    mutationFn: (body: ReturnType<typeof toPayload>) =>
      editing ? api.put(`/api/admin/plans/${editing.id}`, body) : api.post("/api/admin/plans", body),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setNotice(editing ? "Plan saved." : "Plan created.");
    },
  });

  const sync = useMutation({
    mutationFn: (id: number) => api.post<AdminPlan>(`/api/admin/plans/${id}/sync`),
    onSuccess: (p) => {
      refresh();
      setNotice(`${p.name}: now ${formatPrice(p)}, ${formatCadence(p)} (from Polar).`);
    },
  });

  function startEdit(p: AdminPlan | null) {
    setEditing(p);
    setDraft(p ? toDraft(p) : EMPTY);
    setErrors({});
    save.reset();
    setOpen(true);
  }

  function submit() {
    const payload = toPayload(draft);
    const parsed = planSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(firstErrors(parsed.error.issues));
      return;
    }
    setErrors({});
    save.mutate(payload);
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Plans</h1>
          <p className="max-w-2xl text-sm text-muted">
            What students can buy. Create the product in Polar first, paste its product id here, then use
            <strong> Sync from Polar</strong> so the price shown is the price charged. Polar fixes a product&apos;s
            billing interval when it is created; to change it, create a new product and link that.
          </p>
        </div>
        <Button onClick={() => startEdit(null)}>
          <Plus className="h-4 w-4" /> New plan
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {sync.error && <Alert>{(sync.error as Error).message}</Alert>}

      {plans.isLoading ? (
        <Spinner />
      ) : plans.error ? (
        <Alert>{(plans.error as Error).message}</Alert>
      ) : !plans.data?.length ? (
        <EmptyState title="No plans yet" description="Create one to offer it to students." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {plans.data.map((p) => (
            <Card key={p.id} className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted">{p.slug}</p>
                </div>
                <Badge tone={p.is_active ? "success" : "neutral"}>{p.is_active ? "On sale" : "Hidden"}</Badge>
              </div>
              <p className="text-sm">
                <span className="font-semibold">{formatPrice(p)}</span>
                <span className="text-muted"> · {formatCadence(p)}</span>
              </p>
              {Object.keys(p.prices ?? {}).length > 0 && (
                <p className="text-xs text-muted">
                  Local prices: {Object.entries(p.prices).map(([cur, amt]) => formatAmount(amt, cur)).join(" · ")}
                </p>
              )}
              <p className="text-xs text-muted">
                {p.polar_product_id ? <>Polar product <code>{p.polar_product_id}</code></> : "Not linked to Polar: students cannot buy it yet"}
              </p>
              {p.features.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-muted">
                  {p.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => startEdit(p)}>Edit</Button>
                <Button size="sm" variant="outline" disabled={!p.polar_product_id}
                  loading={sync.isPending && sync.variables === p.id} onClick={() => sync.mutate(p.id)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Sync from Polar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : "New plan"} size="lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" error={errors.name} htmlFor="plan-name">
            <Input id="plan-name" value={draft.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Slug" hint="Used in links and records; avoid changing it later" error={errors.slug} htmlFor="plan-slug">
            <Input id="plan-slug" value={draft.slug} maxLength={40} onChange={(e) => set("slug", e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="plan-kind">
            <Select id="plan-kind" value={draft.kind} onChange={(e) => set("kind", e.target.value as Draft["kind"])}>
              <option value="recurring">Subscription (renews)</option>
              <option value="pass">Exam pass (one payment)</option>
            </Select>
          </Field>
          {draft.kind === "recurring" ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Every" error={errors.interval_count} htmlFor="plan-count">
                <Input id="plan-count" type="number" min={1} max={24} value={draft.interval_count}
                  onChange={(e) => set("interval_count", e.target.value)} />
              </Field>
              <Field label="Interval" error={errors.interval} htmlFor="plan-interval">
                <Select id="plan-interval" value={draft.interval} onChange={(e) => set("interval", e.target.value as Draft["interval"])}>
                  <option value="month">month(s)</option>
                  <option value="year">year(s)</option>
                </Select>
              </Field>
            </div>
          ) : (
            <Field label="Days of access" error={errors.duration_days} htmlFor="plan-days">
              <Input id="plan-days" type="number" min={1} max={1095} value={draft.duration_days}
                onChange={(e) => set("duration_days", e.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Price shown" hint="Sync from Polar to match what is charged" error={errors.price_amount} htmlFor="plan-price">
              <Input id="plan-price" type="number" min={0} step="0.01" value={draft.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label="Currency" error={errors.currency} htmlFor="plan-currency">
              <Input id="plan-currency" value={draft.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </Field>
          </div>
          <Field label="Polar product id" hint="From the product page in Polar (sandbox or live)" error={errors.polar_product_id} htmlFor="plan-polar">
            <Input id="plan-polar" value={draft.polar_product_id} maxLength={64} onChange={(e) => set("polar_product_id", e.target.value)} />
          </Field>
          <Field label="Display order" error={errors.display_order} htmlFor="plan-order">
            <Input id="plan-order" type="number" min={0} max={1000} value={draft.display_order} onChange={(e) => set("display_order", e.target.value)} />
          </Field>
          <Field label="Features (one per line)" error={errors.features} htmlFor="plan-features" className="sm:col-span-2">
            <Textarea id="plan-features" rows={4} value={draft.features} onChange={(e) => set("features", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => set("is_active", e.target.checked)} />
            On sale (shown to students)
          </label>
        </div>
        {save.error && <div className="mt-3"><Alert>{(save.error as Error).message}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={save.isPending} onClick={submit}>{editing ? "Save" : "Create plan"}</Button>
        </div>
      </Modal>
    </div>
  );
}
