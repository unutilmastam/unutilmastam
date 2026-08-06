import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * Imzo kaliti. Uchta manba, shu tartibda:
 *   1. android/signing.properties  (storeFile, storePassword, keyAlias, keyPassword)
 *   2. CI muhit oʻzgaruvchilari    (KEYSTORE_FILE, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD)
 *   3. hech biri boʻlmasa — debug kaliti bilan imzolanadi
 * Uchinchi holatda ham APK **imzolangan** boʻladi va istalgan qurilmaga oʻrnatiladi.
 * Google Play uchun esa albatta oʻz kalitingiz kerak (1 yoki 2-usul).
 */
val signProps = Properties().apply {
    val f = rootProject.file("signing.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signValue(key: String, env: String): String? =
    signProps.getProperty(key)?.takeIf { it.isNotBlank() } ?: System.getenv(env)?.takeIf { it.isNotBlank() }

/** PWA fayllari (repo ildizidagi cctv/) ilova assets ichiga nusxalanadi — offline ishlashi uchun */
val pwaAssetsDir = layout.buildDirectory.get().asFile.resolve("generated/pwa")

val copyPwa = tasks.register<Copy>("copyPwa") {
    from(rootProject.file("../cctv")) {
        exclude("**/.DS_Store")
    }
    into(File(pwaAssetsDir, "web"))
}
tasks.named("preBuild") { dependsOn(copyPwa) }

android {
    namespace = "uz.briliant.cctv"
    compileSdk = 35

    sourceSets.getByName("main") {
        assets.srcDir(pwaAssetsDir)
    }

    defaultConfig {
        applicationId = "uz.briliant.cctv"
        minSdk = 23          // Android 6.0+ — faol qurilmalarning ~99 %
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        // Boʻsh boʻlsa ilova ichidagi nusxa ochiladi; toʻldirilsa — masofaviy manzil
        buildConfigField("String", "REMOTE_URL", "\"\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        val ks = signValue("storeFile", "KEYSTORE_FILE")
        if (ks != null) {
            create("release") {
                storeFile = file(ks)
                storePassword = signValue("storePassword", "KEYSTORE_PASSWORD")
                keyAlias = signValue("keyAlias", "KEY_ALIAS")
                keyPassword = signValue("keyPassword", "KEY_PASSWORD")
                enableV1Signing = true   // Android 6 va undan eskilar uchun
                enableV2Signing = true
                enableV3Signing = true
            }
        }
        // Debug kaliti ham eski qurilmalarda ishlashi uchun v1 bilan imzolansin
        getByName("debug") { enableV1Signing = true; enableV2Signing = true }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
        release {
            // Kod qisqartirish oʻchirilgan: WebView + JS koʻprigi bilan ishlaganda
            // R8 xatolari faqat qurilmada bilinadi. Ilova hajmi ~3 MB, farqi sezilmaydi.
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Oʻz kalitimiz boʻlmasa — debug kaliti bilan imzolanadi, ammo baribir
            // imzolangan boʻladi (imzosiz APK hech qanday qurilmaga oʻrnatilmaydi)
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }


    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    packaging {
        resources.excludes += setOf("META-INF/*.kotlin_module")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("com.google.android.material:material:1.12.0")
}
