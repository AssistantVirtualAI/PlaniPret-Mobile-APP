export type CameraPhotoPayload = {
  base64String?: string;
  format?: string;
};

const MIME_BY_FORMAT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function normalizedFormat(value?: string): "jpg" | "png" | "webp" {
  const format = String(value ?? "jpeg").trim().toLowerCase();
  if (format === "png" || format === "webp") return format;
  return "jpg";
}

/** Converts Camera's in-memory base64 result into a File without opening a local URL. */
export function cameraPhotoToFile(photo: CameraPhotoPayload, index = 0): File {
  const base64 = String(photo.base64String ?? "").replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  if (!base64) throw new Error("Photo de caméra introuvable.");

  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let offset = 0; offset < binary.length; offset += 1) bytes[offset] = binary.charCodeAt(offset);

  const format = normalizedFormat(photo.format);
  const mime = MIME_BY_FORMAT[format] ?? "image/jpeg";
  return new File([bytes], `feedback-camera-${Date.now()}-${index}.${format}`, { type: mime });
}
