export type Role = 'patient' | 'doctor' | 'admin';
export type ReportStatus = 'uploaded' | 'processing' | 'completed' | 'failed';
export type Flag = 'low' | 'normal' | 'high';
export type Severity = 'none' | 'mild' | 'moderate' | 'severe';
export type Trend = 'improved' | 'worsened' | 'unchanged' | 'new';

export interface Envelope<T> { data: T; disclaimer: string }
export interface User {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  date_of_birth?: string | null;
  sex?: 'male' | 'female' | 'other' | null;
  height_cm?: number | null;
  fitness_level?: 'beginner' | 'intermediate' | 'advanced';
  dietary_preferences?: string[];
  dietary_restrictions?: string[];
  created_at?: string;
}
export interface Session { access_token: string; refresh_token: string; expires_at: number }

export interface ReportSummary { id: string; file_name: string; category: string | null; report_date: string | null; status: ReportStatus; error_message: string | null; created_at: string }
export interface Biomarker { id: string; name: string; display_name: string; value: number; unit: string | null; ref_low: number | null; ref_high: number | null; flag: Flag; severity: Severity; measured_at: string }
export interface InsightItem { biomarker: string; flag: 'low' | 'high'; explanation: string; possible_causes: string[]; lifestyle_tips: string[]; see_doctor: boolean }
export interface Insight { summary: string; items: { urgent_attention: boolean; list: InsightItem[] }; disclaimer: string }
export interface ReportDetail extends ReportSummary {
  biomarkers: Biomarker[];
  insight: Insight | null;
  diet_plan?: DietPlan | null;
  exercise_plan?: ExercisePlan | null;
}

export interface TrendSeries { name: string; display_name: string; unit: string | null; ref_low: number | null; ref_high: number | null; points: { date: string; value: number; flag: Flag; report_id: string }[] }

export interface DietPlan { id: string; version: number; created_at: string; plan: { summary: string; rationale: string; daily_calorie_target: number | null; hydration_ml: number; foods_to_emphasize: string[]; foods_to_limit: string[]; days: { day: string; meals: { type: string; name: string; description: string; targets: string[] }[] }[]; notes: string[] } }
export interface ExercisePlan { id: string; version: number; created_at: string; plan: { summary: string; rationale: string; weekly_goal_minutes: number; days: { day: string; focus: string; rest: boolean; activities: { name: string; duration_min: number; intensity: string; notes: string | null }[] }[]; safety_notes: string[] } }

export interface DailyLog { id?: string; log_date: string; meals: { name: string; calories?: number }[]; workouts: { type: string; duration_min: number; intensity?: string }[]; water_ml: number; weight_kg: number | null; symptoms: { name: string; severity: number }[]; notes?: string | null }
export interface ComparisonItem { name: string; display_name: string; unit: string | null; previous: number | null; current: number; change_pct: number | null; trend: Trend; flag: Flag }
export interface Comparison { id: string; current_report_id: string; previous_report_id: string; items: ComparisonItem[]; summary: string; created_at: string; reports?: { id: string; report_date: string; category: string }[] }
export interface PatientSummary { id: string; email: string; full_name: string | null; fitness_level: string }
export interface PatientOverview { patient: PatientSummary; reports: ReportSummary[]; biomarkers: Biomarker[]; diet_plan: DietPlan | null; exercise_plan: ExercisePlan | null; daily_logs: DailyLog[]; comparisons: Comparison[] }
