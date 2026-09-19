import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { DepartmentNode } from "../lib/types";
import { Field, Select } from "./ui";

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<DepartmentNode[]>("/api/departments"),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Department, then sub-department. Emits the most specific id chosen, which is
 * what the API stores — the two-level taxonomy is fixed at 21 departments, and
 * 7 of the 9 top-level ones have no children, so the second control explains
 * itself rather than sitting empty.
 */
export function DepartmentPicker({
  value,
  onChange,
  error,
  disabled,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  error?: string;
  disabled?: boolean;
}) {
  const { data: departments = [] } = useDepartments();

  const parent =
    departments.find((d) => d.id === value) ??
    departments.find((d) => d.children.some((c) => c.id === value)) ??
    null;
  const children = parent ? [...parent.children].sort((a, b) => a.name.localeCompare(b.name)) : [];
  const childValue = children.some((c) => c.id === value) ? String(value) : "";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Department" htmlFor="dept" error={error}>
        <Select id="dept" disabled={disabled} value={parent ? String(parent.id) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Choose a department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Sub-department" htmlFor="subdept"
        hint={parent && children.length === 0 ? "This department has no sub-departments" : undefined}>
        <Select id="subdept" disabled={disabled || children.length === 0} value={childValue}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : parent ? parent.id : null)}>
          <option value="">{children.length ? "Whole department" : "—"}</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
