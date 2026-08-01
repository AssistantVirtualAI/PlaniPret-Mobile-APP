# =============================================================================
# proguard-rules.pro — Planipret Mobile
# Règles R8 pour préserver les classes critiques (Capacitor, JsSIP, WebRTC)
# =============================================================================

# ── Capacitor Bridge ─────────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.CapacitorPlugin <methods>;
    @com.getcapacitor.PluginMethod <methods>;
}

# ── Plugins natifs Planipret ─────────────────────────────────────────────────
-keep class com.planipret.mobile.** { *; }

# ── WebView / JavaScript Bridge ───────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── AndroidX / Support Library ────────────────────────────────────────────────
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-dontwarn androidx.**

# ── Firebase (désactivé mais présent dans les dépendances) ───────────────────
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# ── OkHttp / Retrofit (utilisé par Capacitor HTTP) ───────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

# ── Enum (R8 peut casser les enums sérialisés) ───────────────────────────────
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── Parcelable ────────────────────────────────────────────────────────────────
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}

# ── Serializable ─────────────────────────────────────────────────────────────
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ── Ligne de débogage (stack traces lisibles dans Crashlytics / logcat) ───────
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
