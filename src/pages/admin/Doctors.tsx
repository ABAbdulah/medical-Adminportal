import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { UserPlus } from "lucide-react";
import { api } from "../../lib/api";
import { formatDay, type ClinicianRow } from "../../lib/admin-types";
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Spinner } from "../../components/ui";

// Mirrors ClinicianCreate in backend/schemas/clinician.py.
const addSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  full_name: z.string().trim().max(255).refine((v) => v === "" || v.length >= 2, "Full name must be at least 2 characters"),
  specialty: z.string().trim().max(120),
  password: z.string().max(128).refine((p) => p === "" || p.length >= 12, "Passwords must be at least 12 characters"),
});

const EMPTY = { email: "", full_name: "", specialty: "", password: "" };

/** Who may sign in to this portal as a doctor. */
export function AdminDoctors() {
  const queryClient = useQueryClient();
  const doctors = useQuery({
    queryKey: ["admin", "clinicians"],
    queryFn: () => api.get<ClinicianRow[]>("/api/admin/clinicians"),
  });
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (body: { email: string; full_name: string | null; specialty: string | null; password: string | null }) =>
      api.post<ClinicianRow & { created_account: boolean }>("/api/admin/clinicians", body),
    onSuccess: (res) => {
      setNotice(
        res.created_account
          ? `Account created for ${res.email}. Share the password with them securely — they sign in here, at this portal.`
          : `${res.email} can now sign in to this portal as a doctor.`,
      );
      setForm(EMPTY);
      void queryClient.invalidateQueries({ queryKey: ["admin", "clinicians"] });
    },
    onError: (e) => setFormError((e as Error).message),
  });

  const toggle = useMutation({
    mutationFn: (row: ClinicianRow) => api.patch(`/api/admin/clinicians/${row.id}`, { is_active: !row.is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "clinicians"] }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    const parsed = addSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0].message);
      return;
    }
    add.mutate({
      email: parsed.data.email,
      full_name: parsed.data.full_name || null,
      specialty: parsed.data.specialty || null,
      password: parsed.data.password || null,
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Doctors</h1>
        <p className="text-sm text-muted">
          Doctors can write, import, generate and review questions here. They cannot see the administration pages.
        </p>
      </div>

      <Card>
        <CardHeader title="Add a doctor"
          description="Enter an existing account's email, or add a full name and password to create a new account." />
        <CardBody>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Email" htmlFor="d-email">
              <Input id="d-email" type="email" autoComplete="off" maxLength={255} value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Full name (new accounts)" htmlFor="d-name">
              <Input id="d-name" maxLength={255} value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </Field>
            <Field label="Specialty" htmlFor="d-specialty">
              <Input id="d-specialty" maxLength={120} placeholder="e.g. Emergency Medicine" value={form.specialty}
                onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
            </Field>
            <Field label="Password (new accounts, 12+ characters)" htmlFor="d-password">
              <Input id="d-password" type="password" autoComplete="new-password" maxLength={128} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
              <div className="min-h-[1.25rem] text-sm">
                {formError && <p className="text-danger">{formError}</p>}
                {notice && <p className="text-accent-green">{notice}</p>}
              </div>
              <Button type="submit" loading={add.isPending}>
                {!add.isPending && <UserPlus className="h-4 w-4" />} Add doctor
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {toggle.error && <Alert>{(toggle.error as Error).message}</Alert>}

      {doctors.isLoading ? (
        <Spinner />
      ) : doctors.error ? (
        <Alert>{(doctors.error as Error).message}</Alert>
      ) : !doctors.data?.length ? (
        <EmptyState title="No doctors yet" description="Add a doctor above to give them access to this portal." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {doctors.data.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {row.full_name ?? row.email}
                    {row.is_active ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    {row.email}
                    {row.specialty ? ` · ${row.specialty}` : ""}
                    {row.last_login ? ` · last sign-in ${formatDay(row.last_login)}` : " · never signed in"}
                  </p>
                </div>
                <Button variant={row.is_active ? "outline" : "default"} size="sm"
                  loading={toggle.isPending && toggle.variables?.id === row.id} onClick={() => toggle.mutate(row)}>
                  {row.is_active ? "Disable access" : "Restore access"}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
