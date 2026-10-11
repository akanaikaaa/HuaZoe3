package com.healthtrack.app.data

import okhttp3.MultipartBody
import retrofit2.http.*

/** Same REST API the web app uses. All responses are wrapped in Envelope. */
interface ApiService {
    @POST("auth/login") suspend fun login(@Body b: LoginRequest): Envelope<LoginResponse>
    @POST("auth/register") suspend fun register(@Body b: RegisterRequest): Envelope<RegisterResponse>
    @POST("auth/refresh") suspend fun refresh(@Body b: RefreshRequest): Envelope<RefreshResponse>
    @GET("auth/me") suspend fun me(): Envelope<User>

    @Multipart @POST("reports") suspend fun uploadReport(@Part file: MultipartBody.Part): Envelope<ReportSummary>
    @GET("reports") suspend fun reports(): Envelope<List<ReportSummary>>
    @GET("reports/{id}") suspend fun report(@Path("id") id: String): Envelope<ReportDetail>

    @GET("biomarkers/trends") suspend fun trends(): Envelope<List<TrendSeries>>
    @GET("diet-plans/current") suspend fun dietPlan(): Envelope<DietPlan?>
    @GET("exercise-plans/current") suspend fun exercisePlan(): Envelope<ExercisePlan?>
    @POST("plans/regenerate") suspend fun regeneratePlans(): Envelope<Map<String, Any>>

    @GET("daily-logs") suspend fun dailyLogs(): Envelope<List<DailyLog>>
    @PUT("daily-logs/{date}") suspend fun saveLog(@Path("date") date: String, @Body log: DailyLog): Envelope<DailyLog>

    @GET("comparisons") suspend fun comparisons(): Envelope<List<Comparison>>
}
