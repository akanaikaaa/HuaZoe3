package com.healthtrack.app.data

import android.content.ContentResolver
import android.net.Uri
import com.google.gson.JsonParser
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import java.io.IOException

/** Single source of truth for the ViewModels. Maps every failure to a readable message. */
class Repository(private val api: ApiService, private val tokens: TokenStore, private val resolver: ContentResolver) {

    private suspend fun <T> call(block: suspend () -> T): Result<T> = try {
        Result.success(block())
    } catch (e: HttpException) {
        val msg = runCatching {
            JsonParser.parseString(e.response()?.errorBody()?.string()).asJsonObject["error"].asJsonObject["message"].asString
        }.getOrNull() ?: "Request failed (${e.code()})"
        Result.failure(Exception(msg))
    } catch (e: IOException) {
        Result.failure(Exception("Cannot reach the server. Check your connection."))
    }

    val isLoggedIn get() = tokens.session != null
    fun logout() { tokens.session = null }

    suspend fun login(email: String, password: String) = call {
        val r = api.login(LoginRequest(email, password)).data
        tokens.session = r.session
        r.user
    }
    suspend fun register(email: String, password: String, name: String) = call { api.register(RegisterRequest(email, password, name)).data }

    suspend fun reports() = call { api.reports().data }
    suspend fun report(id: String) = call { api.report(id).data }
    suspend fun trends() = call { api.trends().data }
    suspend fun dietPlan() = call { api.dietPlan().data }
    suspend fun exercisePlan() = call { api.exercisePlan().data }
    suspend fun regeneratePlans() = call { api.regeneratePlans().data }
    suspend fun comparisons() = call { api.comparisons().data }
    suspend fun dailyLogs() = call { api.dailyLogs().data }
    suspend fun saveLog(date: String, log: DailyLog) = call { api.saveLog(date, log).data }

    /** Upload from camera or gallery Uri (JPEG/PNG/PDF). */
    suspend fun uploadReport(uri: Uri) = call {
        val mime = resolver.getType(uri) ?: "image/jpeg"
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: throw IOException("Cannot read file")
        require(bytes.size <= 15 * 1024 * 1024) { "File is larger than 15 MB" }
        val ext = if (mime == "application/pdf") "pdf" else "jpg"
        val part = MultipartBody.Part.createFormData("file", "report.$ext", bytes.toRequestBody(mime.toMediaTypeOrNull()))
        api.uploadReport(part).data
    }
}
