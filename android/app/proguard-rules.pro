# JavaScript koʻprigi metodlari obfuskatsiya qilinmasin
-keepclassmembers class uz.briliant.cctv.WebAppBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class uz.briliant.cctv.OnvifDiscovery { *; }
-dontwarn android.webkit.**
