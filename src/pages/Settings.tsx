import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { api, ApiError } from "../lib/api";
import type { SettingField, SettingsResponse } from "../lib/types";
import { Alert, Button, Card, CardBody, CardHeader, Input, Select, Spinner, Textarea } from "../components/ui";

function isSame(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: SettingField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  const id = `set-${field.key}`;

  switch (field.type) {
    case "bool":
      return (
        <label className="inline-flex items-center gap-2">
          <input id={id} type="checkbox" checked={Boolean(value)} disabled={disabled}
            className="h-4 w-4 accent-[rgb(var(--c-accent))]"
            onChange={(e) => onChange(e.target.checked)} />
          <span className="text-sm">{value ? "On" : "Off"}</span>
        </label>
      );
    case "int":
    case "float":
      return (
        <Input id={id} type="number" disabled={disabled} value={value === null || value === undefined ? "" : String(value)}
          min={field.min} max={field.max} step={field.type === "float" ? 0.01 : 1}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      );
    case "select":
      return (
        <Select id={id} disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((o) => {
            const on = selected.includes(o);
            return (
              <button key={o} type="button" disabled={disabled} aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}
                className={`rounded-full border px-3 py-1 text-sm disabled:opacity-50 ${on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted"}`}>
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    case "text":
      return (
        <Textarea id={id} rows={4} disabled={disabled} value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)} />
      );
    case "json":
      return (
        <Textarea id={id} rows={4} disabled={disabled} className="font-mono text-xs"
          value={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch {
              onChange(e.target.value); // keep typing; the server validates on save
            }
          }} />
      );
    default:
      return (
        <Input id={id} disabled={disabled} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      );
  }
}

export function Settings() {
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsResponse>("/api/clinician/settings"),
  });

  const [edits, setEdits] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);

  const effective = useMemo(() => ({ ...(settings.data?.values ?? {}), ...edits }), [settings.data, edits]);
  const changedKeys = useMemo(
    () => Object.keys(edits).filter((k) => !isSame(edits[k], settings.data?.values?.[k])),
    [edits, settings.data],
  );

  const save = useMutation({
    mutationFn: () =>
      api.put<SettingsResponse>("/api/clinician/settings", {
        changes: Object.fromEntries(changedKeys.map((k) => [k, edits[k]])),
      }),
    onSuccess: (next) => {
      queryClient.setQueryData(["settings"], next);
      queryClient.invalidateQueries({ queryKey: ["meta"] });
      setEdits({});
      setSaved(true);
    },
  });

  const reset = useMutation({
    mutationFn: (keys: string[] | null) => api.post<SettingsResponse>("/api/clinician/settings/reset", { keys }),
    onSuccess: (next) => {
      queryClient.setQueryData(["settings"], next);
      queryClient.invalidateQueries({ queryKey: ["meta"] });
      setEdits({});
      setSaved(true);
    },
  });

  if (settings.isLoading) return <Spinner />;
  if (settings.error) return <Alert>{(settings.error as Error).message}</Alert>;
  const data = settings.data!;
  const readOnly = !data.can_edit;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Settings</h1>
          <p className="text-sm text-muted">
            These control how the portal behaves for everyone — generation, review rules, quality thresholds and imports.
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm"
              onClick={() => {
                if (window.confirm("Reset every setting to its default?")) reset.mutate(null);
              }}>
              <RotateCcw className="h-4 w-4" /> Reset all
            </Button>
            <Button size="sm" disabled={changedKeys.length === 0} loading={save.isPending}
              onClick={() => { setSaved(false); save.mutate(); }}>
              Save {changedKeys.length > 0 ? `${changedKeys.length} change${changedKeys.length === 1 ? "" : "s"}` : ""}
            </Button>
          </div>
        )}
      </div>

      {readOnly && (
        <Alert tone="warning">
          You can see these settings but only an administrator can change them.
        </Alert>
      )}
      {saved && changedKeys.length === 0 && <Alert tone="success">Settings saved.</Alert>}
      {save.error && <Alert>{(save.error as ApiError).message}</Alert>}
      {reset.error && <Alert>{(reset.error as ApiError).message}</Alert>}

      {data.schema.map((group) => (
        <Card key={group.group}>
          <CardHeader title={group.label} description={group.description} />
          <CardBody className="space-y-5">
            {group.fields.map((field) => {
              const value = effective[field.key];
              const modified = !isSame(value, data.defaults[field.key]);
              return (
                <div key={field.key} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start">
                  <div>
                    <label htmlFor={`set-${field.key}`} className="block text-sm font-medium">
                      {field.label}
                      {modified && <span className="ml-2 text-xs font-normal text-accent">changed</span>}
                    </label>
                    {field.help && <p className="mt-0.5 text-xs text-muted">{field.help}</p>}
                    <p className="mt-0.5 font-mono text-[11px] text-muted/70">{field.key}</p>
                  </div>
                  <div className="space-y-1.5">
                    <FieldControl field={field} value={value} disabled={readOnly}
                      onChange={(v) => { setSaved(false); setEdits((prev) => ({ ...prev, [field.key]: v })); }} />
                    {modified && !readOnly && (
                      <button type="button" className="text-xs text-muted underline"
                        onClick={() => reset.mutate([field.key])}>
                        Restore default
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
