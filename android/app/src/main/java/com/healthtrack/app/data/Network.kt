package com.healthtrack.app.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.healthtrack.app.BuildConfig
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/** Tokens live in EncryptedSharedPreferences (Android Keystore-backed). */
class TokenStore(context: Context) {
    private val prefs = EncryptedSharedPreferences.create(
        context, "ht_secure",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    var session: Session?
        get() {
            val a = prefs.getString("access", null) ?: return null
            val r = prefs.getString("refresh", null) ?: return null
            return Session(a, r)
        }
        set(v) = prefs.edit().apply {
            if (v == null) clear() else { putString("access", v.accessToken); putString("refresh", v.refreshToken) }
        }.apply()
}

object Network {
    /** Called when refresh fails so the UI can return to login. */
    @Volatile var onSessionExpired: () -> Unit = {}

    fun create(tokens: TokenStore): ApiService {
        // Plain client for the refresh call itself (no auth interceptor, avoids loops).
        val bare = Retrofit.Builder().baseUrl(BuildConfig.API_URL)
            .addConverterFactory(GsonConverterFactory.create()).build().create(ApiService::class.java)

        val authInterceptor = Interceptor { chain ->
            val b: Request.Builder = chain.request().newBuilder()
            tokens.session?.let { b.header("Authorization", "Bearer ${it.accessToken}") }
            chain.proceed(b.build())
        }

        val authenticator = object : Authenticator {
            override fun authenticate(route: Route?, response: Response): Request? {
                if (response.request.url.encodedPath.endsWith("auth/refresh") || responseCount(response) >= 2) return null
                synchronized(this) {
                    val current = tokens.session ?: return null
                    // Another request may already have refreshed.
                    val sent = response.request.header("Authorization")?.removePrefix("Bearer ")
                    if (sent != current.accessToken) return response.request.newBuilder().header("Authorization", "Bearer ${current.accessToken}").build()
                    return try {
                        val fresh = kotlinx.coroutines.runBlocking { bare.refresh(RefreshRequest(current.refreshToken)) }.data.session
                        tokens.session = fresh
                        response.request.newBuilder().header("Authorization", "Bearer ${fresh.accessToken}").build()
                    } catch (e: Exception) {
                        tokens.session = null
                        onSessionExpired()
                        null
                    }
                }
            }
            private fun responseCount(r: Response): Int { var n = 1; var p = r.priorResponse; while (p != null) { n++; p = p.priorResponse }; return n }
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor).authenticator(authenticator)
            .connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
            .build()

        return Retrofit.Builder().baseUrl(BuildConfig.API_URL).client(client)
            .addConverterFactory(GsonConverterFactory.create()).build().create(ApiService::class.java)
    }
}
