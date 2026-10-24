import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Copy, KeyRound } from "lucide-react";
import { api } from "../lib/api";
import type { AdminPlan, AdminUser } from "../lib/admin-types";
import { Alert, Button, Field, Input, Modal, Select } from "./ui";

/** Mirrors routers/admin.py UserCreateIn. */
const schema = z
  .object({
    full_name: z.string().trim().min(2, "Enter the student's full name").max(255),
    email: z.string().trim().email("Enter a valid email address").max(255),
    password: z.string().min(12, "At least 12 characters").max(128),
    country: z.string().trim().max(100),
    plan: z.string(),
    days: z.string(),
    note: z.string().trim().max(300),
  })
  .superRefine((v, ctx) => {
    if (v.plan && v.days) {
      const n = Number(v.days);
      if (!Number.isInteger(n) || n < 1 || n > 3650) {
        ctx.addIssue({ code: "custom", path: ["days"], message: "A whole number from 1 to 3650" });
      }
    }
  });

type Draft = z.infer<typeof schema>;
const EMPTY: Draft = { full_name: "", email: "", password: "", country: "", plan: "", days: "", note: "" };

/** 16 characters from an unambiguous alphabet, from the browser's CSPRNG. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function CreateUserDialog({ plans, onClose }: { plans: AdminPlan[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<{ user: AdminUser; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: (d: Draft) =>
      api.post<AdminUser>("/api/admin/users", {
        full_name: d.full_name.trim(),
        email: d.email.trim(),
        password: d.password,
        country: d.country.trim() || null,
        plan: d.plan || null,
        days: d.plan && d.days ? Number(d.days) : null,
        note: d.plan && d.note.trim() ? d.note.trim() : null,
      }),
    onSuccess: (user, d) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "stats"] });
      setCreated({ user, password: d.password });
    },
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function submit() {
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      const out: Record<string, string> = {};
      for (const issue of parsed.error.issues) out[String(issue.path[0])] ??= issue.message;
      setErrors(out);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  }

  async function copyDetails() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(`Email: ${created.user.email}\nTemporary password: ${created.password}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (created) {
    return (
      <Modal open onClose={onClose} title="Account created">
        <div className="space-y-3 text-sm">
          <p>
            <strong>{created.user.full_name}</strong> can now sign in to the student app.
            {created.user.subscription_status !== "free" && <> They are on <strong>{created.user.subscription_status}</strong>.</>}
          </p>
          <div className="rounded-md border border-border bg-surface-2 p-3 font-mono text-xs">
            <div>Email: {created.user.email}</div>
            <div>Temporary password: {created.password}</div>
          </div>
          <p className="text-xs text-muted">
            Send these to the student privately. This is the only time the password is shown; students cannot change
            it themselves yet.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={copyDetails}>
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy details"}
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Create a student account" size="lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" error={errors.full_name} htmlFor="cu-name">
          <Input id="cu-name" value={draft.full_name} maxLength={255} onChange={(e) => set("full_name", e.target.value)} />
        </Field>
        <Field label="Email" error={errors.email} htmlFor="cu-email">
          <Input id="cu-email" type="email" value={draft.email} maxLength={255} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Temporary password (12+ characters)" error={errors.password} htmlFor="cu-password">
          <div className="flex gap-2">
            <Input id="cu-password" value={draft.password} maxLength={128} autoComplete="new-password"
              onChange={(e) => set("password", e.target.value)} />
            <Button type="button" variant="outline" onClick={() => set("password", generatePassword())}>
              <KeyRound className="h-4 w-4" /> Generate
            </Button>
          </div>
        </Field>
        <Field label="Country (optional)" error={errors.country} htmlFor="cu-country">
          <Input id="cu-country" value={draft.country} maxLength={100} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="Plan" hint="Free, or paid access for a number of days" htmlFor="cu-plan">
          <Select id="cu-plan" value={draft.plan} onChange={(e) => set("plan", e.target.value)}>
            <option value="">Free</option>
            {plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
          </Select>
        </Field>
        {draft.plan && (
          <Field label="Days (empty = one period of the plan)" error={errors.days} htmlFor="cu-days">
            <Input id="cu-days" type="number" min={1} max={3650} value={draft.days} onChange={(e) => set("days", e.target.value)} />
          </Field>
        )}
        {draft.plan && (
          <Field label="Note (optional)" error={errors.note} htmlFor="cu-note" className="sm:col-span-2">
            <Input id="cu-note" value={draft.note} maxLength={300} placeholder="e.g. scholarship cohort"
              onChange={(e) => set("note", e.target.value)} />
          </Field>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">
        The student signs in with this email and password and then sets their exam date. Doctors are added on the Doctors page.
      </p>
      {create.error && <div className="mt-3"><Alert>{(create.error as Error).message}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button loading={create.isPending} onClick={submit}>Create account</Button>
      </div>
    </Modal>
  );
}
