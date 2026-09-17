import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

if (!(URL as any).createObjectURL) {
  (URL as any).createObjectURL = () => "blob:mock";
}
if (!(URL as any).revokeObjectURL) {
  (URL as any).revokeObjectURL = () => {};
}

// Les écrans mobiles utilisent un cache persistant (mémoire + localStorage).
// Chaque test doit repartir d'un cache vide pour observer les vrais appels.
import { beforeEach } from "vitest";
import { invalidateScreenCache } from "@/lib/planipret/screenCache";

beforeEach(() => {
  invalidateScreenCache();
  try { localStorage.clear(); } catch { /* noop */ }
});
