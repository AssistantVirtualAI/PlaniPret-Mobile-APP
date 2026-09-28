import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

const hasCapgoUpdater = fs.existsSync(
  path.resolve(__dirname, "node_modules/@capgo/capacitor-updater/package.json"),
);
const edgeSharedRoot = fs.existsSync(path.resolve(__dirname, "supabase/functions/_shared"))
  ? path.resolve(__dirname, "supabase/functions/_shared")
  : path.resolve(__dirname, "../../supabase/functions/_shared");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@planipret-edge": edgeSharedRoot,
      "framer-motion": path.resolve(__dirname, "./src/lib/motion-shim.tsx"),
      "livekit-client": path.resolve(__dirname, "./src/lib/livekit-shim.ts"),
      ...(hasCapgoUpdater
        ? {}
        : { "@capgo/capacitor-updater": path.resolve(__dirname, "./src/lib/capgo-updater-shim.ts") }),
    },
  },
});
