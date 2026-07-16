import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const KEY = "ava_hide_preview_overlay";

/**
 * Floating button (bottom-left) to hide the Lovable annotation/comments overlay
 * that can sit on top of the preview and partially obscure the UI.
 *
 * It does NOT remove Lovable itself — it injects CSS that hides known overlay
 * containers in the current document, and posts a hint to the parent frame.
 * Persisted across reloads via localStorage.
 */
export function PreviewOverlayToggle() {
  const [hidden, setHidden] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
  });

  useEffect(() => {
    const id = "ava-hide-overlay-css";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    if (hidden) {
      if (!style) {
        style = document.createElement("style");
        style.id = id;
        style.textContent = `
          /* Hide Lovable comment/annotation overlays so the app UI stays clickable */
          [data-lov-id-overlay],
          [data-lovable-overlay],
          #lovable-comments-overlay,
          .lovable-tagger-overlay,
          .lovable-comment-pin,
          iframe[src*="lovable.dev/overlay"],
          iframe[src*="lovable.app/overlay"] {
            display: none !important;
            pointer-events: none !important;
            opacity: 0 !important;
          }
        `;
        document.head.appendChild(style);
      }
      try {
        window.parent?.postMessage({ type: "lovable:hide-overlay", source: "ava" }, "*");
      } catch {}
    } else if (style) {
      style.remove();
      try {
        window.parent?.postMessage({ type: "lovable:show-overlay", source: "ava" }, "*");
      } catch {}
    }
    try { localStorage.setItem(KEY, hidden ? "1" : "0"); } catch {}
  }, [hidden]);

  return (
    <button
      type="button"
      onClick={() => setHidden((v) => !v)}
      title={hidden ? "Réafficher l'overlay de commentaires" : "Masquer l'overlay de commentaires"}
      className="fixed bottom-4 left-4 z-[2147483646] inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur hover:bg-muted transition"
      style={{ boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}
    >
      {hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      {hidden ? "Overlay masqué" : "Masquer overlay"}
    </button>
  );
}
