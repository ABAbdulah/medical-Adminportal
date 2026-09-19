/** Mirrors backend/routers/clinician.py responses. */

export type QuestionType = "basic" | "difficult" | "investigation" | "management" | "risk_factor";
export type Difficulty = "easy" | "medium" | "hard";
export type CandidateStatus = "pending" | "approved" | "rejected";
export type BriefStatus = "draft" | "planning" | "generating" | "ready" | "failed";
export type Origin = "ai" | "sample" | "manual" | "import";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  basic: "Basic",
  difficult: "Difficult / atypical",
  investigation: "Investigation",
  management: "Management",
  risk_factor: "Risk factor",
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export const ORIGIN_LABEL: Record<Origin, string> = {
  ai: "AI-generated",
  sample: "Sample set",
  manual: "Typed by a doctor",
  import: "Imported from a file",
};

export const LETTERS = ["A", "B", "C", "D", "E"] as const;
export type Letter = (typeof LETTERS)[number];

export interface AuthUser {
  id: number;
  email: string;
  full_name: string | null;
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
  is_admin: boolean;
  is_clinician: boolean;
}

export interface DepartmentNode {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  children: DepartmentNode[];
}

export interface SourceOption {
  code: string;
  name: string;
  abbreviation: string;
  tier: number;
}

export interface Meta {
  question_types: { value: QuestionType; description: string }[];
  sources: SourceOption[];
  limits: {
    max_target_per_request: number;
    daily_generation_cap: number;
    generated_today: number;
    required_approvals: number;
    max_attachments: number;
    max_attachment_bytes: number;
  };
  settings: Record<string, unknown>;
  is_admin: boolean;
  user_id: number;
}

export interface CheckResult {
  code: string;
  level: "pass" | "warn" | "fail";
  message: string;
}

export interface CandidateOption {
  letter: Letter;
  text: string;
  is_correct: boolean;
  explanation: string;
}

export interface CandidateRow {
  id: number;
  brief_id: number | null;
  batch_label: string;
  origin: Origin;
  department_id: number;
  department: string;
  topic: string;
  angle: string | null;
  question_type: QuestionType;
  difficulty: Difficulty;
  status: CandidateStatus;
  version: number;
  stem_preview: string;
  checks: { fail: number; warn: number };
  approvals: number;
  created_at: string | null;
}

export interface ReviewEntry {
  id: number;
  reviewer_id: number | null;
  reviewer_name: string | null;
  decision: "approve" | "reject" | "edit";
  candidate_version: number;
  notes: string | null;
  created_at: string | null;
}

export interface CandidateDetail extends CandidateRow {
  brief_title: string | null;
  created_by: number | null;
  created_by_name: string | null;
  question_text: string;
  options: CandidateOption[];
  explanation: string;
  learning_point: string | null;
  source_code: string | null;
  reference: string | null;
  check_details: CheckResult[];
  rejection_reason: string | null;
  published_question_id: number | null;
  required_approvals: number;
  reviews: ReviewEntry[];
  next_pending_id: number | null;
  prev_pending_id: number | null;
  published?: { id: number; qid: number } | null;
}

export interface Brief {
  id: number;
  title: string;
  department_id: number;
  department: string;
  topic: string;
  target_count: number;
  generated_count: number;
  question_types: QuestionType[];
  difficulty_mix: Partial<Record<Difficulty, number>>;
  instructions: string;
  example_mcqs: string;
  status: BriefStatus;
  stale: boolean;
  last_error: string | null;
  model: string | null;
  created_by: number;
  created_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
  counts: Partial<Record<CandidateStatus, number>>;
  attachments?: { id: number; filename: string; content_type: string; size_bytes: number }[];
}

export interface Paged<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

export interface Stats {
  pending: number;
  approved: number;
  rejected: number;
  needs_attention: number;
  my_reviews_today: number;
  generated_today: number;
  topics: { topic: string; department: string; approved: number; pending: number }[];
}

export interface SettingField {
  key: string;
  label: string;
  type: "int" | "float" | "bool" | "string" | "text" | "select" | "multiselect" | "json";
  default: unknown;
  help?: string;
  min?: number;
  max?: number;
  options?: string[];
}

export interface SettingGroup {
  group: string;
  label: string;
  description: string;
  fields: SettingField[];
}

export interface SettingsResponse {
  schema: SettingGroup[];
  values: Record<string, unknown>;
  defaults: Record<string, unknown>;
  can_edit: boolean;
}

export interface ImportRow {
  index: number;
  label: string;
  errors: string[];
  item: Record<string, unknown> | null;
  checks: CheckResult[];
}

export interface ImportPreview {
  filename: string;
  total: number;
  valid: number;
  invalid: number;
  rows: ImportRow[];
}

export const BRIEF_STATUS_LABEL: Record<BriefStatus, string> = {
  draft: "Not started",
  planning: "Planning angles",
  generating: "Writing questions",
  ready: "Ready for review",
  failed: "Stopped",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    // the year only earns its space once it isn't this one
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function emptyOptions(): CandidateOption[] {
  return LETTERS.map((letter, i) => ({
    letter,
    text: "",
    is_correct: i === 0,
    explanation: "",
  }));
}
