# JavaScript koʻprigi metodlari obfuskatsiya qilinmasin
-keepclassmembers class uz.itcode.cctv.WebAppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class uz.itcode.cctv.OnvifDiscovery { *; }
-dontwarn android.webkit.**
