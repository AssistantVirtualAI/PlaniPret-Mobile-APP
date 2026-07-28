import React from 'react';
import { createRoot } from 'react-dom/client';
// Side-effect import: throws at boot if a production build was bundled with
// VITE_AVA_MOCK=true. Must run before any UI mounts.
import './lib/buildGuard';
import { installSipBootGuard } from './lib/sip/bootSipGuard';
installSipBootGuard();
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import MobileApp from './MobileApp';
import DemoModeBanner from './components/DemoModeBanner';
import './styles.css';

async function bootstrap() {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#001a3d' });
    } catch {}
    try {
      await SplashScreen.hide();
    } catch {}
  }

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <>
      <DemoModeBanner />
      <MobileApp />
    </>
  );
}

bootstrap();
