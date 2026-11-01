/** Mirrors backend/routers/admin.py responses (the platform-admin half of the portal). */

import type { Difficulty, QuestionType } from "./types";

export interface AdminStats {
  users: number;
  premium_subscriptions: number;
  mcq_count: number;
  recall_docs: number;
}

export interface Analytics {
  active_window_days: number;
  total_users: number;
  active_users: number;
  most_attempted_departments: { subject: string; attempts: number; users: number; accuracy: number }[];
  lowest_scoring_topics: {
    topic: string;
    subject: string;
    recall_flag: boolean;
    attempts: number;
    accuracy: number;
  }[];
  min_attempts_for_topic_ranking: number;
  recall_performance: {
    recall: { attempts: number; accuracy: number };
    non_recall: { attempts: number; accuracy: number };
  };
}

export interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  country: string | null;
  /** the plan slug while access runs, otherwise "free" */
  subscription_status: string;
  premium_until: string | null;
  created_at: string;
  last_login: string | null;
}

/** GET/POST/PUT /api/admin/plans */
export interface AdminPlan {
  id: number;
  slug: string;
  name: string;
  kind: "recurring" | "pass";
  interval: "month" | "year" | null;
  interval_count: number;
  duration_days: number | null;
  price_amount: number; // minor units
  currency: string;
  /** every price Polar has for the product, by currency (minor units); filled by Sync */
  prices: Record<string, number>;
  features: string[];
  is_active: boolean;
  display_order: number;
  polar_product_id: string | null;
  updated_at: string | null;
}

/** GET /api/admin/users/{id}/entitlements */
export interface Entitlement {
  id: number;
  plan: string;
  source: "admin" | "polar" | "dev" | "legacy";
  status: "active" | "revoked" | "refunded";
  starts_at: string | null;
  ends_at: string | null;
  running: boolean;
  cancel_at_period_end: boolean;
  polar_subscription_id: string | null;
  polar_order_id: string | null;
  granted_by: number | null;
  note: string | null;
}

/** Same shape as the student app's labels: "PKR 30,000", "USD 108.50". */
export function formatAmount(amount: number, currency: string): string {
  if (amount === 0) return "Free";
  const major = amount / 100;
  const digits = amount % 100 === 0 ? 0 : 2;
  return `${currency} ${major.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatPrice(p: Pick<AdminPlan, "price_amount" | "currency">): string {
  return formatAmount(p.price_amount, p.currency);
}

export function formatCadence(p: Pick<AdminPlan, "kind" | "interval" | "interval_count" | "duration_days">): string {
  if (p.kind === "pass") return `one payment, ${p.duration_days ?? "?"} days`;
  return p.interval_count === 1 ? `every ${p.interval}` : `every ${p.interval_count} ${p.interval}s`;
}

export type BankStatus = "published" | "draft" | "archived";

export interface BankOption {
  letter: string;
  text: string;
  is_correct: boolean;
  explanation: string | null;
}

export type ImageRole = "stem" | "teaching";

/** A question picture (question_images); `url` is a signed link that expires, null without storage. */
export interface BankImage {
  id: number;
  role: ImageRole;
  position: number;
  url: string | null;
  caption: string;
  width: number;
  height: number;
  content_type: string;
  bytes: number;
}

/** A guideline link behind a question (question_references). */
export interface BankReference {
  id?: number;
  position?: number;
  label: string;
  url: string;
  domain?: string;
  /** review | explanation | learning_point | related | mentioned | manual */
  section: string;
  /** derived rather than printed in the source document */
  inferred: boolean;
  status_code?: number | null;
  checked_at?: string | null;
}

export interface TopicReviewSection {
  heading: string;
  body: string;
}

export interface BankTopicReview {
  title: string;
  sections: TopicReviewSection[];
}

/** Provenance of an imported question (questions.import_meta). */
export interface ImportMeta {
  source?: string;
  number?: number;
  page?: number;
  style_tag?: string;
  difficulty_tag?: string;
  layout?: string;
}

/** An index cluster (question_topics) — GET /api/admin/question-topics. */
export interface BankTopic {
  id: number;
  department_id: number;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  question_count: number;
}

/** A question already in the student bank (GET /api/admin/questions). */
export interface BankQuestion {
  id: number;
  qid: number | null;
  subject: string;
  topic: string;
  /** index title shown to students only after they answer */
  title: string | null;
  /** ADMIN-ONLY: students never see difficulty */
  difficulty: Difficulty | string;
  status: BankStatus | string;
  /** in the free trial's sample pool: the only questions free students can open */
  is_free_sample: boolean;
  question_text: string;
  explanation: string;
  learning_point: string | null;
  reference_source: string | null;
  department_id: number | null;
  topic_id: number | null;
  topic_name: string | null;
  question_type: QuestionType | null;
  topic_review: BankTopicReview | null;
  import_meta: ImportMeta | null;
  references: BankReference[];
  created_at: string | null;
  updated_at: string;
  options: BankOption[];
}

export type RecallStatus = "processing" | "processed" | "approved" | "failed";

export interface RecallDoc {
  id: number;
  filename: string;
  exam_month: string;
  status: RecallStatus | string;
  upload_date: string;
}

export interface RecallTopicRow {
  id: number;
  topic: string;
  subtopic: string | null;
  subject: string;
  frequency: number;
}

export interface Quote {
  id: number;
  quote: string;
  author: string;
  category: string;
}

export interface Article {
  id: number;
  title: string;
  category: string;
  summary: string;
  content: string;
}

export interface ClinicianRow {
  id: number;
  user_id: number;
  email: string;
  full_name: string | null;
  specialty: string | null;
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
}

/** "3 Sep 2026" — dates without the time, for joins and uploads. */
export function formatDay(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
