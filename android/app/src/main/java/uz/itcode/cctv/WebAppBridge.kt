package uz.itcode.cctv

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream

/**
 * JavaScript koʻprigi. Sahifada `window.ITCCTV` sifatida koʻrinadi.
 * Faqat ilova ichidagi (assets yoki oʻz domenimizdagi) sahifa uchun ochiladi.
 */
class WebAppBridge(private val activity: Activity, private val web: WebView) {

    /**
     * ONVIF WS-Discovery. Brauzer UDP multicast yubora olmaydi — shu sabab
     * qidiruv shu yerda bajariladi va natija JSON sifatida callbackga qaytadi.
     * @param callbackName window[callbackName](json) koʻrinishidagi funksiya nomi
     */
    @JavascriptInterface
    fun discoverOnvif(callbackName: String, timeoutMs: Int) {
        Thread {
            val devices = try {
                OnvifDiscovery(activity).probe(timeoutMs.coerceIn(1500, 15000))
            } catch (e: Exception) {
                JSONArray()
            }
            val safeName = callbackName.filter { it.isLetterOrDigit() || it == '_' }
            val json = devices.toString().replace("\\", "\\\\").replace("'", "\\'")
            web.post {
                web.evaluateJavascript("window['$safeName'] && window['$safeName']('$json')", null)
            }
        }.start()
    }

    /** Snapshot/video faylni qurilma "Downloads" papkasiga saqlaydi (blob: URL ishlamaydi) */
    @JavascriptInterface
    fun saveBase64(base64: String, fileName: String, mime: String): Boolean {
        return try {
            val clean = base64.substringAfter("base64,", base64)
            val bytes = Base64.decode(clean, Base64.DEFAULT)
            val name = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
            if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val resolver = activity.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
                resolver.openOutputStream(uri)?.use { it.write(bytes) }
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } else {
                @Suppress("DEPRECATION")
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                dir.mkdirs()
                FileOutputStream(File(dir, name)).use { it.write(bytes) }
            }
            toast(activity.getString(R.string.saved_to_downloads))
            true
        } catch (e: Exception) {
            toast(activity.getString(R.string.download_failed))
            false
        }
    }

    /** FCM token (google-services.json qoʻshilganda toʻldiriladi) */
    @JavascriptInterface
    fun getPushToken(): String = activity
        .getSharedPreferences("itcctv", Context.MODE_PRIVATE)
        .getString("fcm_token", "") ?: ""

    /** Qurilma haqida qisqa maʼlumot — ilova diagnostikasi uchun */
    @JavascriptInterface
    fun deviceInfo(): String =
        """{"platform":"android","sdk":${Build.VERSION.SDK_INT},"model":"${Build.MODEL}","app":"${BuildConfig.VERSION_NAME}"}"""

    @JavascriptInterface
    fun toast(text: String) {
        activity.runOnUiThread { Toast.makeText(activity, text, Toast.LENGTH_SHORT).show() }
    }

    /** Ekranni oʻchmaydigan qilib qoʻyish (jonli koʻrish davomida) */
    @JavascriptInterface
    fun keepAwake(on: Boolean) {
        activity.runOnUiThread {
            if (on) activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else activity.window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}
