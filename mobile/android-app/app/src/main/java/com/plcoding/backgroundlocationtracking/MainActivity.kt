package com.plcoding.backgroundlocationtracking

import android.Manifest
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.plcoding.backgroundlocationtracking.admin.MyDeviceAdminReceiver
import com.plcoding.backgroundlocationtracking.admin.PolicyManager
import com.plcoding.backgroundlocationtracking.receiver.BootReceiver
import com.plcoding.backgroundlocationtracking.service.LocationService
import com.plcoding.backgroundlocationtracking.ui.theme.UserIdentityDialog
import com.plcoding.backgroundlocationtracking.util.AppHider
import com.plcoding.backgroundlocationtracking.worker.RetryTrackingWorker
import com.plcoding.backgroundlocationtracking.worker.RetryWorkerScheduler
import com.plcoding.backgroundlocationtracking.data.network.ApiClient
import kotlinx.coroutines.*

class MainActivity : AppCompatActivity() {

    private val TAG = "MainActivity"

    private lateinit var policyManager: PolicyManager
    private lateinit var adminComponent: ComponentName

    private val permissions = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()

    private val requestPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            permissions.forEach {
                val status =
                    if (ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED) "✅"
                    else "❌"
                Log.d(TAG, "$status Permission: $it")
            }

            if (result.all { it.value }) {
                Log.i(TAG, "✅ Quyền được cấp đầy đủ — hiển thị dialog nhập thông tin")
                showUserIdentityDialog()
            } else {
                Log.w(TAG, "⚠️ Người dùng từ chối quyền — hiển thị cảnh báo")
                showPermissionDialog()
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val sharedPref = getSharedPreferences("setup_prefs", Context.MODE_PRIVATE)
        if (sharedPref.getBoolean("setup_done", false)) {
            Log.i(TAG, "🚫 Setup đã hoàn thành trước đó — kiểm tra service trước khi đóng app.")

            if (!isLocationServiceRunning()) {
                Log.w(TAG, "⚠️ LocationService chưa chạy — khởi động lại ngay.")
                startLocationService()
            } else {
                Log.i(TAG, "📍 LocationService vẫn đang hoạt động — không cần setup lại")
            }

            finishAndRemoveTask()
            return
        }

        Log.i(TAG, "🚀 Bắt đầu setup mới")
        policyManager = PolicyManager(this)
        adminComponent = ComponentName(this, MyDeviceAdminReceiver::class.java)

        ensureDeviceAdmin()
    }

    // ==========================
    // 🚀 Device Admin / Device Owner
    // ==========================
    private fun ensureDeviceAdmin() {
        val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager

        if (!dpm.isAdminActive(adminComponent)) {
            Log.w(TAG, "⚙️ App chưa có quyền Device Admin — yêu cầu người dùng kích hoạt")
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "Ứng dụng cần quyền quản trị thiết bị để bảo vệ và quản lý chính sách doanh nghiệp."
                )
            }
            startActivity(intent)
            return
        } else Log.i(TAG, "✅ App đã là Device Admin")

        if (dpm.isDeviceOwnerApp(packageName)) {
            Log.i(TAG, "🏢 App hiện là DEVICE OWNER")
            applyEnterprisePolicies()
        } else {
            Log.w(TAG, "⚠️ App chưa phải Device Owner (chỉ có quyền Device Admin)")
        }
    }

    private fun applyEnterprisePolicies() {
        lifecycleScope.launch {
            Log.i(TAG, "🚀 Áp dụng chính sách Device Owner...")
            policyManager.blockUninstall(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                policyManager.blockLocationPermissionChanges()
            policyManager.enforceLocationPolicy()

            enableBootReceiver()
            checkPermissions()
        }
    }

    private fun checkPermissions() {
        val allGranted = permissions.all {
            ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
        }

        if (allGranted) showUserIdentityDialog()
        else requestPermissionLauncher.launch(permissions)
    }

    // ==========================
    // 📡 User Identity & Tracking
    // ==========================
    private fun showUserIdentityDialog() {
        UserIdentityDialog(this).show { deviceId, title, userName ->
            Log.i(TAG, "✅ UserIdentity đã nhập: DeviceID=$deviceId, Title=$title, UserName=$userName")

            getSharedPreferences("setup_prefs", Context.MODE_PRIVATE).edit()
                .putBoolean("setup_done", true)
                .putString("device_id", deviceId)
                .putString("title", title)
                .putString("user_name", userName)
                .apply()

            Log.i(TAG, "💾 SharedPreferences đã lưu xong, chuẩn bị start LocationService")
            startTrackingSystem(deviceId, title, userName)
        }
    }

    private fun startTrackingSystem(deviceId: String, title: String, userName: String) {
        lifecycleScope.launch {

            // 1️⃣ Start tracking ngay
            Log.i(TAG, "📡 Khởi động LocationService ngay lập tức")
            startLocationService()

            // 2️⃣ Activate device (JWT) — CHẠY IO THREAD
            withContext(Dispatchers.IO) {
                Log.i(TAG, "🔑 Bắt đầu kích hoạt device để lấy JWT với retry production-ready")
                retryDeviceActivation(deviceId, title, userName, maxRetry = 5, delayMs = 30_000L)
            }

            // 3️⃣ Hide app icon + về Home
            delay(1000)
            AppHider.hideAppIcon(this@MainActivity)
            Log.i(TAG, "🕵️‍♂️ App đã ẩn icon, chuyển về màn hình Home")

            startActivity(
                Intent(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
            )
            finishAndRemoveTask()

            // 4️⃣ Schedule retry worker
            scheduleRetryWorker()
        }
    }

    private suspend fun retryDeviceActivation(
        deviceId: String,
        title: String,
        userName: String,
        maxRetry: Int,
        delayMs: Long
    ) {
        repeat(maxRetry) { attempt ->
            Log.i(TAG, "🔄 Thử kích hoạt device lần ${attempt + 1}")
            val activated = ApiClient.activateDevice(deviceId, title, userName)
            if (activated) {
                Log.i(TAG, "✅ Device JWT nhận thành công sau lần thử ${attempt + 1}")
                return
            }
            Log.e(TAG, "❌ Kích hoạt thất bại lần ${attempt + 1}, retry sau $delayMs ms")
            delay(delayMs)
        }
        Log.e(TAG, "❌ Không nhận được JWT sau $maxRetry lần — giao cho Worker xử lý tiếp")
    }

    // ==========================
    // 📍 Location Service
    // ==========================
    private fun startLocationService() {
        val intent = Intent(this, LocationService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            ContextCompat.startForegroundService(this, intent)
        else startService(intent)

        Log.i(TAG, "📡 LocationService đã được start (Foreground - ẩn hoàn toàn)")
    }

    private fun isLocationServiceRunning(): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return manager.getRunningServices(Int.MAX_VALUE)
            .any { it.service.className == LocationService::class.java.name }
    }

    // ==========================
    // 🔁 Worker
    // ==========================
    private fun scheduleRetryWorker() {
        val request = OneTimeWorkRequestBuilder<RetryTrackingWorker>().build()
        WorkManager.getInstance(applicationContext)
            .enqueueUniqueWork("RetryTrackingWorkerOnce", ExistingWorkPolicy.REPLACE, request)

        RetryWorkerScheduler.schedule(applicationContext)
        Log.i(TAG, "⏰ RetryTrackingWorker đã được lên lịch")
    }

    // ==========================
    // ⚠️ UI
    // ==========================
    private fun showPermissionDialog() {
        AlertDialog.Builder(this)
            .setTitle("Yêu cầu quyền truy cập")
            .setMessage("Ứng dụng cần quyền Location và Notification để hoạt động chính xác.")
            .setPositiveButton("Thử lại") { _, _ ->
                requestPermissionLauncher.launch(permissions)
            }
            .setNegativeButton("Thoát") { _, _ -> finish() }
            .setCancelable(false)
            .show()
    }

    private fun enableBootReceiver() {
        val receiver = ComponentName(this, BootReceiver::class.java)
        packageManager.setComponentEnabledSetting(
            receiver,
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP
        )
        Log.i(TAG, "🔔 BootReceiver đã được bật")
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "🧹 MainActivity bị hủy (service vẫn chạy nền).")
    }
}
