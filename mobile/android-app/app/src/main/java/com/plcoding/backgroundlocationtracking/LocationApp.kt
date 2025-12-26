package com.plcoding.backgroundlocationtracking

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log

class LocationApp : Application() {

    companion object {
        const val LOCATION_CHANNEL_ID = "location"

        // ⭐ Biến tĩnh truy cập context toàn cục
        private var instance: LocationApp? = null
        val appContext: Context
            get() = instance!!.applicationContext
    }

    override fun onCreate() {
        super.onCreate()
        instance = this // ⭐ Khởi tạo instance

        Log.d("LocationApp", "🚀 App started")

        // ✅ Tạo notification channel ẩn hoàn toàn nếu Device Owner
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                LOCATION_CHANNEL_ID,
                "Background Location",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            }

            val notificationManager =
                getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)

            Log.d("LocationApp", "✅ Silent NotificationChannel created")
        }
    }
}
