// Stub utilisé quand `@capgo/capacitor-updater` n'est pas installé
// (preview web, CI sans plateformes natives). L'OTA est alors désactivée
// silencieusement — voir src/lib/native/otaUpdater.ts.
export const CapacitorUpdater = null as any;
export default { CapacitorUpdater };
