plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

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
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        // Boʻsh boʻlsa ilova ichidagi nusxa ochiladi; toʻldirilsa — masofaviy manzil
        buildConfigField("String", "REMOTE_URL", "\"\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Imzo kalitlari CI da (yoki signing.properties orqali) qoʻshiladi —
            // boʻlmasa release APK imzosiz yigʻiladi
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
