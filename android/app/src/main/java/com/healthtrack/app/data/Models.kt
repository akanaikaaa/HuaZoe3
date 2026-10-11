package com.healthtrack.app.data

import com.google.gson.annotations.SerializedName

data class Envelope<T>(val data: T, val disclaimer: String?)

data class Session(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("refresh_token") val refreshToken: String,
)
data class LoginResponse(val session: Session, val user: User)
data class RegisterResponse(@SerializedName("confirmation_required") val confirmationRequired: Boolean)
data class User(val id: String, val email: String, @SerializedName("full_name") val fullName: String?, val role: String)

data class LoginRequest(val email: String, val password: String)
data class RegisterRequest(val email: String, val password: String, @SerializedName("full_name") val fullName: String)
data class RefreshRequest(@SerializedName("refresh_token") val refreshToken: String)
data class RefreshResponse(val session: Session)

data class ReportSummary(
    val id: String,
    @SerializedName("file_name") val fileName: String,
    val category: String?,
    @SerializedName("report_date") val reportDate: String?,
    val status: String, // uploaded | processing | completed | failed
    @SerializedName("error_message") val errorMessage: String?,
    @SerializedName("created_at") val createdAt: String,
)

data class Biomarker(
    val id: String,
    @SerializedName("display_name") val displayName: String,
    val value: Double,
    val unit: String?,
    @SerializedName("ref_low") val refLow: Double?,
    @SerializedName("ref_high") val refHigh: Double?,
    val flag: String,
    val severity: String,
)
data class InsightItem(
    val biomarker: String, val flag: String, val explanation: String,
    @SerializedName("possible_causes") val possibleCauses: List<String>,
    @SerializedName("lifestyle_tips") val lifestyleTips: List<String>,
    @SerializedName("see_doctor") val seeDoctor: Boolean,
)
data class InsightItems(@SerializedName("urgent_attention") val urgentAttention: Boolean, val list: List<InsightItem>)
data class Insight(val summary: String, val items: InsightItems, val disclaimer: String)
data class ReportDetail(
    val id: String, @SerializedName("file_name") val fileName: String, val category: String?,
    val status: String, @SerializedName("error_message") val errorMessage: String?,
    val biomarkers: List<Biomarker>, val insight: Insight?,
)

data class TrendPoint(val date: String, val value: Double, val flag: String)
data class TrendSeries(
    val name: String, @SerializedName("display_name") val displayName: String, val unit: String?,
    val points: List<TrendPoint>,
)

data class DietMeal(val type: String, val name: String, val description: String)
data class DietDay(val day: String, val meals: List<DietMeal>)
data class DietContent(
    val summary: String, val rationale: String,
    @SerializedName("hydration_ml") val hydrationMl: Int,
    @SerializedName("foods_to_emphasize") val foodsToEmphasize: List<String>,
    @SerializedName("foods_to_limit") val foodsToLimit: List<String>,
    val days: List<DietDay>,
)
data class DietPlan(val id: String, val version: Int, val plan: DietContent)

data class Activity(val name: String, @SerializedName("duration_min") val durationMin: Int, val intensity: String)
data class ExerciseDay(val day: String, val focus: String, val rest: Boolean, val activities: List<Activity>)
data class ExerciseContent(
    val summary: String, val rationale: String,
    @SerializedName("weekly_goal_minutes") val weeklyGoalMinutes: Int,
    val days: List<ExerciseDay>,
    @SerializedName("safety_notes") val safetyNotes: List<String>,
)
data class ExercisePlan(val id: String, val version: Int, val plan: ExerciseContent)

data class MealLog(val name: String)
data class WorkoutLog(val type: String, @SerializedName("duration_min") val durationMin: Int)
data class SymptomLog(val name: String, val severity: Int)
data class DailyLog(
    @SerializedName("log_date") val logDate: String? = null,
    val meals: List<MealLog> = emptyList(),
    val workouts: List<WorkoutLog> = emptyList(),
    @SerializedName("water_ml") val waterMl: Int = 0,
    @SerializedName("weight_kg") val weightKg: Double? = null,
    val symptoms: List<SymptomLog> = emptyList(),
)

data class ComparisonItem(
    @SerializedName("display_name") val displayName: String,
    val previous: Double?, val current: Double,
    @SerializedName("change_pct") val changePct: Double?, val trend: String,
)
data class Comparison(val id: String, val summary: String, val items: List<ComparisonItem>)
