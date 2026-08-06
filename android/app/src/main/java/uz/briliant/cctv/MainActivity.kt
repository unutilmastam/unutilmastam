package uz.briliant.cctv

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewFeature

/**
 * BRILIANT — PWA ni WebView ichida ishga tushiradi va brauzerda mavjud
 * boʻlmagan imkoniyatlarni (ONVIF WS-Discovery, fayl saqlash, push token)
 * JavaScript koʻprigi orqali beradi.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var web: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private var pendingPermissionRequest: PermissionRequest? = null
    private var fileChooser: ValueCallback<Array<Uri>>? = null

    /** Ilova sahifasi: bundlangan nusxa yoki masofaviy manzil (BuildConfig.REMOTE_URL) */
    private val startUrl: String
        get() = if (BuildConfig.REMOTE_URL.isNotBlank()) BuildConfig.REMOTE_URL
        else "https://appassets.androidplatform.net/assets/web/index.html"

    private val permLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        val req = pendingPermissionRequest ?: return@registerForActivityResult
        pendingPermissionRequest = null
        val granted = result.values.all { it }
        if (granted) req.grant(req.resources) else req.deny()
    }

    private val notifLauncher = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val fileLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val cb = fileChooser ?: return@registerForActivityResult
        fileChooser = null
        cb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = Color.parseColor("#0B0F14")
        window.navigationBarColor = Color.parseColor("#0B0F14")

        web = WebView(this).apply { visibility = View.INVISIBLE }   // splash sahifa yuklanguncha koʻrinadi
        refresh = SwipeRefreshLayout(this).apply {
            setColorSchemeColors(Color.parseColor("#2E8FFF"))
            setProgressBackgroundColorSchemeColor(Color.parseColor("#151E2B"))
            addView(web, FrameLayout.LayoutParams(-1, -1))
            setOnRefreshListener { web.reload() }
        }
        setContentView(refresh)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // Service Worker ham assets orqali ishlashi uchun (offline kesh, push)
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(
                object : ServiceWorkerClientCompat() {
                    override fun shouldInterceptRequest(request: WebResourceRequest): WebResourceResponse? =
                        loader.shouldInterceptRequest(request.url)
                }
            )
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false          // jonli oqim avtomatik boshlanadi
            allowFileAccess = false
            allowContentAccess = false
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
            javaScriptCanOpenWindowsAutomatically = true
            setSupportMultipleWindows(false)
            // Lokal kameralar koʻpincha HTTP (snapshot/MJPEG) beradi
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            userAgentString = "$userAgentString BRILIANT/${BuildConfig.VERSION_NAME}"
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val internal = url.host == "appassets.androidplatform.net" ||
                        (BuildConfig.REMOTE_URL.isNotBlank() && url.host == Uri.parse(BuildConfig.REMOTE_URL).host)
                if (internal) return false
                // Tashqi havolalar brauzerda ochiladi
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, url)); true
                } catch (e: Exception) { true }
            }

            override fun onPageFinished(view: WebView, url: String) {
                refresh.isRefreshing = false
                view.visibility = View.VISIBLE
            }

            override fun onReceivedError(view: WebView, req: WebResourceRequest, err: WebResourceError) {
                if (!req.isForMainFrame) return
                refresh.isRefreshing = false
                // Masofaviy manzil ishlamasa — bundlangan nusxaga qaytamiz
                if (BuildConfig.REMOTE_URL.isNotBlank() && view.url?.startsWith(BuildConfig.REMOTE_URL) == true) {
                    view.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
                }
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            /** Kamera (QR skaner) va mikrofon (gapirish) uchun ruxsat */
            override fun onPermissionRequest(request: PermissionRequest) {
                val need = mutableListOf<String>()
                request.resources.forEach {
                    when (it) {
                        PermissionRequest.RESOURCE_VIDEO_CAPTURE -> need += Manifest.permission.CAMERA
                        PermissionRequest.RESOURCE_AUDIO_CAPTURE -> need += Manifest.permission.RECORD_AUDIO
                    }
                }
                val missing = need.filter {
                    ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED
                }
                if (missing.isEmpty()) request.grant(request.resources)
                else { pendingPermissionRequest = request; permLauncher.launch(missing.toTypedArray()) }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, cb: GeolocationPermissions.Callback) {
                val ok = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) ==
                        PackageManager.PERMISSION_GRANTED
                cb.invoke(origin, ok, false)
            }

            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileChooser?.onReceiveValue(null)
                fileChooser = cb
                return try { fileLauncher.launch(params.createIntent()); true }
                catch (e: Exception) { fileChooser = null; false }
            }
        }

        // Oddiy (blob boʻlmagan) yuklab olishlar
        web.setDownloadListener { url, _, contentDisposition, mime, _ ->
            try {
                val req = DownloadManager.Request(Uri.parse(url))
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setMimeType(mime)
                (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            } catch (e: Exception) {
                Toast.makeText(this, getString(R.string.download_failed), Toast.LENGTH_SHORT).show()
            }
        }

        web.addJavascriptInterface(WebAppBridge(this, web), "BRILIANT")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.__briliantBack && window.__briliantBack())===true") { r ->
                    if (r != "true") {
                        if (web.canGoBack()) web.goBack() else finish()
                    }
                }
            }
        })

        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(startUrl)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() { super.onPause(); web.onPause() }
    override fun onResume() { super.onResume(); web.onResume() }
    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
