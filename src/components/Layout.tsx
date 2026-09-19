import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  BarChart3, BookOpen, ClipboardCheck, FileStack, FileUp, LayoutDashboard, ListChecks, LogOut, Moon,
  PenLine, Settings as SettingsIcon, Sparkles, Stethoscope, Sun, UserCog, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import type { Meta } from "../lib/types";
import { Button } from "./ui";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Question authoring and review — doctors and admins. */
const AUTHORING: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/write", label: "Write", icon: PenLine },
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/generate", label: "Generate with AI", icon: Sparkles },
  { to: "/review", label: "Review queue", icon: ClipboardCheck },
];

/** Platform administration — admins only (the API enforces this too). */
const ADMINISTRATION: NavItem[] = [
  { to: "/admin", label: "Platform analytics", icon: BarChart3, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/questions", label: "Question bank", icon: ListChecks },
  { to: "/admin/recalls", label: "Recalls", icon: FileStack },
  { to: "/admin/content", label: "Content", icon: BookOpen },
  { to: "/admin/doctors", label: "Doctors", icon: UserCog },
  { to: "/settings", label: "Portal settings", icon: SettingsIcon },
];

function sideLinkClass({ isActive }: { isActive: boolean }) {
  return clsx(
    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2 hover:text-foreground",
  );
}

function tabLinkClass({ isActive }: { isActive: boolean }) {
  return clsx(
    "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
    isActive ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground",
  );
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</p>
      <div className="space-y-0.5">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={sideLinkClass}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function Layout() {
  const { user, isAdmin, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api.get<Meta>("/api/clinician/meta") });
  const title = (meta?.settings?.["portal.title"] as string) || "AMC Compass · Clinical Review";
  // Doctors see Settings read-only, as before; the other admin sections are admin-only.
  const adminItems = isAdmin ? ADMINISTRATION : ADMINISTRATION.filter((i) => i.to === "/settings");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
              <Stethoscope className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">{title}</span>
          </span>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden max-w-[14rem] truncate px-2 text-sm text-muted md:inline">
              {user?.full_name ?? user?.email}
              {isAdmin && <span className="ml-1 text-xs text-accent">(admin)</span>}
            </span>
            <Button variant="ghost" size="icon" onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* phones and tablets: one scrolling strip of tabs */}
        <nav aria-label="Portal sections" className="flex gap-1 overflow-x-auto px-4 lg:hidden">
          {[...AUTHORING, ...adminItems].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabLinkClass}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <div className="flex">
        <aside aria-label="Portal sections"
          className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 space-y-5 overflow-y-auto border-r border-border px-3 py-5 lg:block">
          <NavGroup title="Questions" items={AUTHORING} />
          <NavGroup title={isAdmin ? "Administration" : "Portal"} items={adminItems} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

/** Route guard for platform-admin pages. A doctor who types the URL lands on the overview. */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />;
}
