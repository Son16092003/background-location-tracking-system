package com.plcoding.backgroundlocationtracking.data.network

import android.content.Context
import android.util.Log
import com.plcoding.backgroundlocationtracking.BuildConfig
import com.plcoding.backgroundlocationtracking.LocationApp
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject

object ApiClient {

    private const val TAG = "API_CLIENT"

    // ✅ Base domain (chỉ lưu domain chính, dễ thay đổi)
    private val BASE_DOMAIN = BuildConfig.BASE_DOMAIN

    // ✅ Default endpoint (API path có thể nối vào BASE_DOMAIN)
    val BASE_URL = "$BASE_DOMAIN/api/GPS_DeviceTracking"

    // ===================== LOGGING =====================
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.ENABLE_HTTP_LOG) {
            HttpLoggingInterceptor.Level.BODY
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
    }

    private var jwtToken: String? = null
        set(value) {
            field = value
            val prefs = LocationApp.appContext
                .getSharedPreferences("setup_prefs", Context.MODE_PRIVATE).edit()
            prefs.putString("jwt_token", value)
            prefs.apply()
        }

    fun getJwtToken(): String? = jwtToken

    fun getJwtTokenMasked(): String {
        val token = jwtToken ?: return "null"
        return if (token.length > 10) {
            token.substring(0, 5) + "..." + token.takeLast(5)
        } else token
    }

    private val okHttpClient: OkHttpClient by lazy {
        val prefs = LocationApp.appContext
            .getSharedPreferences("setup_prefs", Context.MODE_PRIVATE)
        jwtToken = prefs.getString("jwt_token", null)

        OkHttpClient.Builder()
            .addInterceptor { chain ->
                val original = chain.request()
                val requestBuilder = original.newBuilder()
                    .addHeader("Content-Type", "application/json")

                val token = jwtToken
                if (!token.isNullOrEmpty()) {
                    requestBuilder.addHeader("Authorization", "Bearer $token")
                    Log.d(TAG, "🔐 Gắn JWT token (first 8 chars): ${token.take(8)}...")
                } else {
                    Log.w(TAG, "⚠️ JWT token chưa tồn tại trong SharedPreferences")
                }

                val request = requestBuilder.build()
                Log.d(TAG, "➡️ Sending request to: ${request.url}")
                chain.proceed(request)
            }
            .addInterceptor(loggingInterceptor)
            .build()
    }

    fun postJsonSync(json: String, endpoint: String = ""): Pair<Boolean, String> {
        return try {
            val mediaType = "application/json; charset=utf-8".toMediaType()
            val body = json.toRequestBody(mediaType)

            // ✅ Nối BASE_DOMAIN + endpoint
            val url = if (endpoint.isNotEmpty()) "$BASE_DOMAIN/$endpoint" else BASE_URL

            val request = Request.Builder()
                .url(url)
                .post(body)
                .build()

            Log.d(TAG, "📤 POST JSON to $url: $json")

            okHttpClient.newCall(request).execute().use { response ->
                val responseBody = response.body?.string() ?: "No content"
                Log.d(TAG, "⬅️ Response code: ${response.code}, body: $responseBody")

                if (response.isSuccessful) {
                    Pair(true, responseBody)
                } else {
                    Pair(false, "HTTP ${response.code}: ${response.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception in postJsonSync", e)
            Pair(false, e.message ?: "Unknown error")
        }
    }

    suspend fun activateDevice(deviceId: String, title: String, userName: String): Boolean {
        return try {
            val payload = JSONObject().apply {
                put("DeviceID", deviceId)
                put("Title", title)
                put("UserName", userName)
            }

            val (success, response) = postJsonSync(payload.toString(), "api/device/activate")
            if (!success) {
                Log.e(TAG, "❌ Device activate failed: $response")
                return false
            }

            val json = JSONObject(response)
            if (json.has("token")) {
                jwtToken = json.getString("token")
                Log.i(TAG, "✅ Device activated, token jwt received: ${getJwtTokenMasked()}")
                true
            } else {
                Log.e(TAG, "❌ Device activate response không chứa token jwt")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ Exception in activateDevice: ${e.message}", e)
            false
        }
    }
}
