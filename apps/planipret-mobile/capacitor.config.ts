import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Planiprêt Mobile — Capacitor configuration
 * App ID : com.planipret.mobile  (distinct de com.lemtel.softphone)
 * Cible  : iOS 16+ / Android 13+
 */
const config: CapacitorConfig = {
  appId: 'com.planipret.mobile',
  appName: 'Planiprêt Mobile',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    allowsLinkPreview: false,
    scrollEnabled: false,
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // IMPORTANT: must stay disabled. When enabled, the native HTTP bridge
    // patches window.fetch and drops/overrides the Supabase `Authorization`
    // header, so every Edge Function call arrives with the anon key
    // ("invalid claim: missing sub claim" / 401 unauthorized).
    CapacitorHttp: {
      enabled: false,
    },
    SplashScreen: {
      // The web layer calls SplashScreen.hide() on first paint (src/index.tsx).
      // Auto-hide is disabled so WebKit stops logging the splash timeout warning.
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: '#0A1425',   // Bleu nuit Planiprêt
      showSpinner: false,
    },
    StatusBar: {
      style: 'light',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_planipret',
      iconColor: '#2E9BDC',
    },
  },
};

export default config;
