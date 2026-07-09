# Planiprêt Mobile — Standalone Capacitor App

Bundle ID: `com.planipret.mobile`
App name: Planiprêt Mobile

## Quickstart

```bash
cd apps/planipret-mobile
npm install
npm run audit:native
npm run build
npx cap add ios
npx cap sync ios
cd ios/App && pod install && cd ../..
npx cap open ios
```

Android:
```bash
cd apps/planipret-mobile
npm run audit:native
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

## Notes

- Fully standalone — always run commands from `apps/planipret-mobile`, never from the repo root.
- Uses the same `/mplanipret` routes, mobile pages, components, hooks, i18n and visual assets.
- Supabase Edge Functions are called via `@supabase/supabase-js` against the shared backend.
- `@capacitor-community/bluetooth-le@4.x` is pinned for Capacitor 6 compatibility.
