import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { forwardRef, useEffect } from "react";
import type { CheckResult } from "../lib/types";

/* ---------------------------------------------------------------- button */

type Variant = "default" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  default: "bg-accent text-white hover:opacity-90",
  secondary: "bg-surface-2 text-foreground border border-border hover:bg-border/50",
  outline: "border border-border bg-transparent hover:bg-surface-2",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground",
  danger: "bg-danger text-white hover:opacity-90",
  success: "bg-accent-green text-white hover:opacity-90",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
  icon: "h-9 w-9",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

/* ----------------------------------------------------------------- inputs */

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={clsx(FIELD, "h-9 py-0", className)} {...props} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={clsx(FIELD, "resize-y leading-relaxed", className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={clsx(FIELD, "h-9 py-0", className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={clsx("block text-sm font-medium", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ cards */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-xl border border-border bg-surface", className)} {...props} />;
}

export function CardHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("p-4", className)} {...props} />;
}

/* ----------------------------------------------------------------- badges */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border border-border",
  accent: "bg-accent/15 text-accent",
  success: "bg-accent-green/15 text-accent-green",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

export function Badge({ tone = "neutral", className, ...props }: { tone?: Tone } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", TONES[tone], className)}
      {...props}
    />
  );
}

/* --------------------------------------------------------------- feedback */

export function Alert({ tone = "danger", children }: { tone?: Tone; children: React.ReactNode }) {
  const border = { neutral: "border-border", accent: "border-accent/40", success: "border-accent-green/40", warning: "border-warning/40", danger: "border-danger/40" }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={clsx("rounded-md border px-3 py-2 text-sm", border, TONES[tone])}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** "lg" for forms (question editor, article editor). */
  size?: "md" | "lg";
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label={title}
        className={clsx(
          "relative z-10 flex max-h-[90vh] w-full flex-col rounded-xl border border-border bg-surface shadow-xl",
          size === "lg" ? "max-w-2xl" : "max-w-lg",
        )}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- check results UI */

export function CheckIcon({ level }: { level: CheckResult["level"] }) {
  if (level === "fail") return <XCircle className="h-4 w-4 shrink-0 text-danger" aria-label="Must fix" />;
  if (level === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-label="Check" />;
  return <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-green" aria-label="Passed" />;
}

export function CheckSummary({ fail, warn }: { fail: number; warn: number }) {
  if (!fail && !warn) return <span className="text-xs text-accent-green">All checks passed</span>;
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      {fail > 0 && (
        <span className="inline-flex items-center gap-1 font-medium text-danger">
          <XCircle className="h-3.5 w-3.5" /> {fail} must fix
        </span>
      )}
      {warn > 0 && (
        <span className="inline-flex items-center gap-1 text-warning">
          <AlertTriangle className="h-3.5 w-3.5" /> {warn} to check
        </span>
      )}
    </span>
  );
}

export function CheckList({ checks }: { checks: CheckResult[] }) {
  const order = { fail: 0, warn: 1, pass: 2 } as const;
  return (
    <ul className="space-y-2">
      {[...checks]
        .sort((a, b) => order[a.level] - order[b.level])
        .map((c) => (
          <li key={c.code} className="flex gap-2 text-sm">
            <CheckIcon level={c.level} />
            <span className={c.level === "pass" ? "text-muted" : undefined}>{c.message}</span>
          </li>
        ))}
    </ul>
  );
}
