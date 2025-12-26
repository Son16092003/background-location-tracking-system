package com.plcoding.backgroundlocationtracking.data.network

import android.content.SharedPreferences
import android.util.Log
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(
    private val prefs: SharedPreferences
) : Interceptor {

    companion object {
        private const val TAG = "AuthInterceptor"
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()

        // 🔑 Lấy JWT Device đã lưu sau khi activate
        val deviceToken = prefs.getString("device_jwt", null)

        val requestBuilder = originalRequest.newBuilder()
            .addHeader("Content-Type", "application/json")

        if (!deviceToken.isNullOrEmpty()) {
            // ✅ Gắn Authorization Bearer nếu có token
            requestBuilder.addHeader("Authorization", "Bearer $deviceToken")
            Log.d(TAG, "🔐 Gắn JWT token (first 8 chars): ${deviceToken.take(8)}...")
        } else {
            // ⚠️ Cảnh báo nếu token chưa setup
            Log.w(TAG, "⚠️ Device JWT chưa tồn tại. Hãy setup lần đầu trước khi gửi request!")
        }

        val request = requestBuilder.build()

        val response = chain.proceed(request)

        // ⭐ Logging nếu server trả về 401 Unauthorized (token invalid/expired)
        if (response.code == 401) {
            Log.e(TAG, "❌ 401 Unauthorized — token có thể hết hạn hoặc không hợp lệ!")
            // Tùy chọn: bạn có thể trigger event để yêu cầu setup lại
        }

        return response
    }
}
