/** Display the native engine's actual identity, never a renamed W/x device. */
export function mobileLinePresentation(snapshot: { extension?: unknown; username?: unknown }, profileExtension: string | null) {
  const extension = String(snapshot.extension ?? "").trim();
  const username = String(snapshot.username ?? "").trim();
  if (/^\d{2,6}$/.test(extension) && username === `${extension}M`) {
    return { extension, deviceId: username };
  }
  return { extension: profileExtension, deviceId: null };
}