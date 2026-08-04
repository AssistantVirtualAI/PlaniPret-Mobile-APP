# Planiprêt Mobile — Standalone Capacitor App

Bundle ID: `com.planipret.mobile`
App name: Planiprêt Mobile

## Quickstart

```bash
cd apps/planipret-mobile
npm install
npm run ios:build-pjsip
npm run audit:native
npm run build
npx cap add ios
npm run ios:build-sync
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

## Build & sync — automated flow

Two one-shot scripts remove all manual steps between "code changed" and "ready to press Run in Xcode / Android Studio":

```bash
npm run ios:build-sync       # vite build → precheck → cap sync ios
npm run android:build-sync   # vite build → precheck → cap sync android
```

Each script does three things, in order:

1. **`npm run build`** — Vite regenerates `VITE_BUILD_ID` and `VITE_BUILD_TIME` on every run (see `vite.config.ts`), so the *Build info* block on `/mplanipret/style-diagnostics` will always reflect the last compilation.
2. **`npm run precheck:build`** (`scripts/precheck-build.mjs`) — fails fast if:
   - Tailwind utilities are not present in the compiled CSS (`postcss.config.js` broken, purge misconfigured, etc.).
   - The build ID embedded in the JS bundle does not match today's UTC date — meaning the diagnostics screen would show a stale build.
3. **`npx cap sync <platform>`** — copies the fresh `dist/` into the native project and syncs plugins.

### When to run `npm run ios:build-sync`

Run it any time you want the iOS app in Xcode to reflect the current web code:

- After editing any file under `src/`, `tailwind.config.ts`, `index.html`, or `capacitor.config.ts`.
- Before archiving for TestFlight / App Store.
- Whenever the *Build web ID* on the in-app **Diagnostic styles** page (`/mplanipret/style-diagnostics`) does not match the one you expect.

Do **not** run it just to install a new npm dependency — run `npm install` first, then `ios:build-sync`.

### Remaining Xcode steps (minimum)

After `ios:build-sync` finishes cleanly:

1. `npx cap open ios` (only the first time, or after closing Xcode).
2. In Xcode: **Product ▸ Clean Build Folder** (`⇧⌘K`) — required if you changed native plugins or `Info.plist`; optional otherwise.
3. Select a simulator or a connected device in the scheme picker.
4. Press **Run** (`⌘R`).
5. Once launched, open `/mplanipret/style-diagnostics` in the app and confirm the *Build web ID* matches the timestamp printed by the last `vite build`.

For Android, replace steps 1–4 with **Android Studio ▸ Sync Gradle ▸ Run**.

## Notes

- Fully standalone — always run commands from `apps/planipret-mobile`, never from the repo root.
- Uses the same `/mplanipret` routes, mobile pages, components, hooks, i18n and visual assets.
- Supabase Edge Functions are called via `@supabase/supabase-js` against the shared backend.
- `@capacitor-community/bluetooth-le@4.x` is pinned for Capacitor 6 compatibility.
