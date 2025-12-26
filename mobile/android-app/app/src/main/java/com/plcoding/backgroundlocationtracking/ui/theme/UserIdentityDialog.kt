package com.plcoding.backgroundlocationtracking.ui.theme

import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings
import android.view.LayoutInflater
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import com.plcoding.backgroundlocationtracking.R
import java.util.Locale
import java.util.UUID
import java.nio.charset.StandardCharsets

class UserIdentityDialog(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("setup_prefs", Context.MODE_PRIVATE)

    val deviceId: String
        get() {
            val androidId = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: "unknown_device"

            return UUID.nameUUIDFromBytes(
                androidId.toByteArray(StandardCharsets.UTF_8)
            ).toString()
        }

    fun show(
        onConfirmed: ((deviceId: String, title: String, userName: String) -> Unit)? = null
    ) {
        val savedTitle = prefs.getString("title", null)
        val savedUser = prefs.getString("user_name", null)

        // ✅ Nếu đã có dữ liệu thì trả luôn, không hiện dialog
        if (!savedTitle.isNullOrEmpty() && !savedUser.isNullOrEmpty()) {
            onConfirmed?.invoke(deviceId, savedTitle, savedUser)
            return
        }

        val inflater = LayoutInflater.from(context)
        val dialogView = inflater.inflate(R.layout.dialog_user_identity, null)

        val titleInput = dialogView.findViewById<EditText>(R.id.etTitle)
        val userInput = dialogView.findViewById<EditText>(R.id.etUserName)

        val alertDialog = AlertDialog.Builder(context)
            .setTitle("Thiết lập định danh thiết bị")
            .setView(dialogView)
            .setCancelable(false)
            .setPositiveButton("Xác nhận", null)
            .create()

        alertDialog.setOnShowListener {
            val button = alertDialog.getButton(AlertDialog.BUTTON_POSITIVE)
            button.setOnClickListener {
                val title = titleInput.text.toString().trim()
                val user = userInput.text.toString().trim()

                if (title.isEmpty() || user.isEmpty()) {
                    Toast.makeText(
                        context,
                        "Vui lòng nhập đầy đủ thông tin",
                        Toast.LENGTH_SHORT
                    ).show()
                    return@setOnClickListener
                }

                // ✅ Chỉ lưu Title + UserName
                prefs.edit()
                    .putString("title", title)
                    .putString("user_name", user)
                    .apply()

                onConfirmed?.invoke(deviceId, title, user)
                alertDialog.dismiss()
            }
        }

        alertDialog.show()
    }

    /**
     * Lấy identity đã lưu (phục vụ debug / restore)
     */
    fun getSavedIdentity(): Triple<String, String?, String?> {
        val title = prefs.getString("title", null)
        val user = prefs.getString("user_name", null)
        return Triple(deviceId, title, user)
    }
}
