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
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 1800,
      backgroundColor: '#0A1425',   // Bleu nuit Planiprêt
      showSpinner: false,
    },
    StatusBar: {
      style: 'light',
      backgroundColor: '#1A4A8A',   // Bleu Planiprêt
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
