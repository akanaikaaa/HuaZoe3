plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.healthtrack.app"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.healthtrack.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        // 10.0.2.2 = host machine from the Android emulator. Override for production in release buildType.
        buildConfigField("String", "API_URL", "\"http://10.0.2.2:4000/api/v1/\"")
    }
    buildTypes {
        release {
            isMinifyEnabled = true
            buildConfigField("String", "API_URL", "\"https://YOUR-APP.up.railway.app/api/v1/\"")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation("androidx.navigation:navigation-compose:2.8.1")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    // No logging interceptor on purpose: health data and tokens must not reach logs.
}
