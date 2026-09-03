// Déclaration minimale pour @capgo/capacitor-updater (aucun type publié).
declare module "@capgo/capacitor-updater" {
  export const CapacitorUpdater: {
    download(options: { url: string; version: string; checksum?: string }): Promise<{ id: string }>;
    next(options: { id: string }): Promise<void>;
    reset(): Promise<void>;
    notifyAppReady(): Promise<void>;
    current(): Promise<{ bundle?: { id?: string; version?: string } }>;
  };
}
