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

export type Plan = "free" | "monthly" | "annual";
export const PLANS: readonly Plan[] = ["free", "monthly", "annual"];

export interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  country: string | null;
  subscription_status: Plan | string;
  created_at: string;
  last_login: string | null;
}

export type BankStatus = "published" | "draft" | "archived";

export interface BankOption {
  letter: string;
  text: string;
  is_correct: boolean;
  explanation: string | null;
}

/** A question already in the student bank (GET /api/admin/questions). */
export interface BankQuestion {
  id: number;
  qid: number | null;
  subject: string;
  topic: string;
  difficulty: Difficulty | string;
  status: BankStatus | string;
  question_text: string;
  explanation: string;
  learning_point: string | null;
  reference_source: string | null;
  department_id: number | null;
  question_type: QuestionType | null;
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
